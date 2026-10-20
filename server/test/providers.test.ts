import { describe, expect, it } from 'vitest'
import { fingerprintFromPcm } from '@polycast/core'
import { ffmpegAacEncoder, ffmpegFingerprint, ffmpegLoudness, guideFilter, pcmToWav, silentWav, wavDurationSec } from '../src/audio'
import { elevenLabsSpeech, resolveElevenModel } from '../src/providers/elevenlabs'
import { chooseTtsProvider, withFallbackSpeech } from '../src/providers/speechChoice'
import { elevenVoiceFor, guideById } from '../src/voices'
import { wordsFromScribe, scribeTranscriber } from '../src/providers/elevenlabs'
import { geminiSpeech, geminiText, readInteraction, readTokenUsage } from '../src/providers/gemini'
import { chirpVoiceName, googleChirpSpeech } from '../src/providers/googleTts'
import { errorFromResponse, ProviderError } from '../src/providers/types'
import { mapLimit, perMinute, retryAfterMs, withRetry } from '../src/retry'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('ElevenLabs Scribe', () => {
  it('keeps spoken words and drops spacing and audio events', () => {
    expect(
      wordsFromScribe([
        { text: 'Hej', start: 0, end: 0.4, type: 'word', speaker_id: 'speaker_0' },
        { text: ' ', start: 0.4, end: 0.5, type: 'spacing' },
        { text: '(laughter)', start: 0.5, end: 1, type: 'audio_event' },
      ]),
    ).toEqual([{ text: 'Hej', start: 0, end: 0.4, speaker: 'speaker_0' }])
  })

  it('sends the publisher URL, never the audio, and reports usage', async () => {
    let sent: FormData | undefined
    const t = scribeTranscriber('key', async (_url, init) => {
      sent = init!.body as FormData
      return json({ language_code: 'sv', words: [{ text: 'Hej', start: 0, end: 0.4, type: 'word' }] })
    })
    const r = await t.transcribe({ audioUrl: 'https://cdn/x.mp3', language: 'sv', durationSec: 600 })
    expect(sent!.get('source_url')).toBe('https://cdn/x.mp3')
    expect(sent!.get('model_id')).toBe('scribe_v2')
    expect(sent!.get('file')).toBeNull()
    expect(r.usage.transcriptionSec).toBe(600)
  })

  it('uploads the exact bytes it is given, so timings match our fingerprint', async () => {
    let sent: FormData | undefined
    const t = scribeTranscriber('key', async (_url, init) => {
      sent = init!.body as FormData
      return json({ words: [] })
    })
    await t.transcribe({ audioUrl: 'https://cdn/x.mp3', language: 'sv', durationSec: 60, audio: new Uint8Array([1, 2, 3]) })
    expect(sent!.get('source_url')).toBeNull()
    const file = sent!.get('file') as Blob
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('asks Scribe to spell the show’s names, and takes only its spellings, not its timings', async () => {
    let sent: FormData | undefined
    const t = scribeTranscriber('key', async (_url, init) => {
      sent = init!.body as FormData
      return json({
        words: [
          { text: 'Hej', start: 0, end: 0.4, type: 'word' },
          { text: ' ', start: 0.4, end: 0.5, type: 'spacing' },
          { text: 'Siggi.', start: 0.5, end: 1, type: 'word' },
        ],
        edited_transcript: { kind: 'transcript', text: 'Hej Sigge.' },
      })
    })
    const r = await t.transcribe({ audioUrl: 'u', language: 'sv', durationSec: 600, names: { showTitle: 'Alex & Sigges podcast', hosts: ['Alex Schulman', 'Sigge Eklund'], names: [] } })
    expect(String(sent!.get('transcript_edit'))).toContain('Sigge Eklund')
    expect(r.words).toEqual([{ text: 'Hej', start: 0, end: 0.4 }, { text: 'Sigge.', start: 0.5, end: 1 }])
    expect(r.usage).toEqual({ transcriptionSec: 600, transcriptEditSec: 600 })
  })

  it('keeps the original transcript when the edit fails, and sends no instruction without names', async () => {
    let sent: FormData | undefined
    const t = scribeTranscriber('key', async (_url, init) => {
      sent = init!.body as FormData
      return json({ words: [{ text: 'Siggi', start: 0, end: 0.4, type: 'word' }], edited_transcript: { kind: 'error', error_type: 'edit_failed', message: 'no' } })
    })
    const r = await t.transcribe({ audioUrl: 'u', language: 'sv', durationSec: 5, names: { showTitle: 'Show', hosts: ['Sigge'], names: [] } })
    expect(r.words.map((w) => w.text)).toEqual(['Siggi'])
    expect(r.usage.transcriptEditSec).toBe(10) // billed for at least 10 seconds
    const r2 = await t.transcribe({ audioUrl: 'u', language: 'sv', durationSec: 5 })
    expect(sent!.get('transcript_edit')).toBeNull()
    expect(r2.usage.transcriptEditSec).toBeUndefined()
  })

  it('marks rate limits as retryable and bad requests as not', async () => {
    const limited = scribeTranscriber('key', async () => new Response('slow down', { status: 429 }))
    await expect(limited.transcribe({ audioUrl: 'u', language: 'sv', durationSec: 1 })).rejects.toMatchObject({ retryable: true, status: 429 })
    const bad = scribeTranscriber('key', async () => new Response('nope', { status: 422 }))
    await expect(bad.transcribe({ audioUrl: 'u', language: 'sv', durationSec: 1 })).rejects.toMatchObject({ retryable: false })
  })
})

describe('Gemini', () => {
  it('reads text and audio from interaction replies', () => {
    const reply = { steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }, { type: 'audio', data: 'AAAA' }] }] }
    expect(readInteraction(reply)).toEqual({ text: '{"a":1}', audioBase64: 'AAAA' })
    expect(readInteraction({ output_text: 'x' })).toEqual({ text: 'x' })
  })

  it('uses reported token counts, or estimates them', () => {
    expect(readTokenUsage({ usage: { total_input_tokens: 10, total_output_tokens: 5 } }, 999, 999)).toEqual({ textInTokens: 10, textOutTokens: 5 })
    expect(readTokenUsage({}, 400, 40)).toEqual({ textInTokens: 100, textOutTokens: 10 })
  })

  it('requests JSON with a schema and parses the reply', async () => {
    let body: any
    const m = geminiText('key', 'gemini-3.8-flash', async (_u, init) => {
      body = JSON.parse(String(init!.body))
      return json({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"ok":true}' }] }] })
    })
    const r = await m.generateJson<{ ok: boolean }>({ system: 'S', prompt: 'P', schema: { type: 'object' } })
    expect(r.data.ok).toBe(true)
    expect(body.model).toBe('gemini-3.8-flash')
    expect(body.response_format).toMatchObject({ type: 'text', mime_type: 'application/json' })
  })

  it('treats a malformed JSON reply as retryable', async () => {
    const m = geminiText('key', undefined, async () => json({ output_text: 'not json' }))
    await expect(m.generateJson({ system: '', prompt: '', schema: {} })).rejects.toMatchObject({ retryable: true })
  })

  it('voices text with the chosen voice and style, measuring the WAV it gets back', async () => {
    let body: any
    const wav = silentWav(2)
    const s = geminiSpeech('key', async (w) => ({ audio: w, mimeType: 'audio/wav' }), undefined, async (_u, init) => {
      body = JSON.parse(String(init!.body))
      return json({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: Buffer.from(wav).toString('base64') }] }] })
    })
    const r = await s.synthesize({ text: 'Hello', voice: 'Sulafat', style: 'warm', language: 'en' })
    expect(r.durationSec).toBeCloseTo(2, 3)
    expect(body.generation_config.speech_config[0].voice).toBe('Sulafat')
    expect(body.input[0].content[0].annotations[0].style).toBe('warm')
  })
})

describe('Google Cloud TTS (Chirp 3 HD)', () => {
  it('voices text as the guide in the learner\'s language, British English for English', async () => {
    let url = ''
    let headers: Record<string, string> = {}
    let body: any
    const wav = silentWav(1.5)
    const s = googleChirpSpeech('k3y', async (w) => ({ audio: w, mimeType: 'audio/wav' }), {
      fetchImpl: async (u, init) => {
        url = String(u)
        headers = init!.headers as Record<string, string>
        body = JSON.parse(String(init!.body))
        return json({ audioContent: Buffer.from(wav).toString('base64') })
      },
    })
    const r = await s.synthesize({ text: 'Nice one. Listen again.', voice: 'Sulafat', style: 'warm', language: 'en' })
    expect(url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize')
    expect(headers['x-goog-api-key']).toBe('k3y')
    expect(body.voice).toEqual({ languageCode: 'en-GB', name: 'en-GB-Chirp3-HD-Sulafat' })
    expect(body.audioConfig.audioEncoding).toBe('LINEAR16')
    expect(r.durationSec).toBeCloseTo(1.5, 3)
    expect(r.usage).toEqual({ ttsChars: 23 })
  })

  it('picks a locale for each language, falling back to British English', () => {
    expect(chirpVoiceName('Achird', 'de')).toEqual({ languageCode: 'de-DE', name: 'de-DE-Chirp3-HD-Achird' })
    expect(chirpVoiceName('Achird', 'xx').languageCode).toBe('en-GB')
  })

  it('treats a daily quota as final, but a per-minute limit as worth retrying', () => {
    expect(errorFromResponse('Gemini TTS', 429, 'limit: 100 requests per day on Tier 1').retryable).toBe(false)
    expect(errorFromResponse('Gemini TTS', 429, 'limit: 10 requests per minute on Tier 1').retryable).toBe(true)
  })
})

describe('audio', () => {
  it('reads WAV durations', () => {
    expect(wavDurationSec(silentWav(1.5))).toBeCloseTo(1.5, 3)
    expect(() => wavDurationSec(new Uint8Array(50))).toThrow('Not a WAV file')
  })

  it('fingerprints an episode with ffmpeg the same way the app does', async () => {
    // Two seconds of a tone that gets louder, as 8 kHz WAV: ffmpeg's frames match the shared maths.
    const rate = 8000
    const pcm = Int16Array.from({ length: rate * 2 }, (_, i) => Math.round(Math.sin(i / 3) * 200 * (1 + (i / rate) * 40)))
    const wav = silentWav(2, rate)
    new Int16Array(wav.buffer, 44).set(pcm)
    const fp = await ffmpegFingerprint()(wav)
    const expected = fingerprintFromPcm(pcm)
    expect(fp).toHaveLength(40)
    for (let i = 0; i < 40; i++) expect(Math.abs(fp[i]! - expected[i]!)).toBeLessThanOrEqual(1)
    expect(fp[39]!).toBeGreaterThan(fp[0]!)
  })

  it('encodes guide speech to small AAC files with ffmpeg', async () => {
    const wav = silentWav(3)
    const { audio, mimeType } = await ffmpegAacEncoder()(wav)
    expect(mimeType).toBe('audio/mp4')
    expect(audio.byteLength).toBeGreaterThan(100)
    expect(audio.byteLength).toBeLessThan(wav.byteLength / 4)
  })

  // PC-1017-F16: guide lines at the podcast standard with short fades; episodes measured.
  const tone = (seconds: number, amplitude: number, rate = 24000) => {
    const pcm = Int16Array.from({ length: Math.round(rate * seconds) }, (_, i) => Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * amplitude))
    return pcmToWav(new Uint8Array(pcm.buffer), rate)
  }

  it('renders a guide line at -16 LUFS with fades in and out', async () => {
    expect(guideFilter(2)).toBe('loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.03,afade=t=out:st=1.970:d=0.03')
    const { audio } = await ffmpegAacEncoder()(tone(3, 1500)) // a quiet line, about -30 LUFS
    const lufs = await ffmpegLoudness()(audio)
    expect(lufs).toBeDefined()
    expect(lufs!).toBeGreaterThan(-18.5)
    expect(lufs!).toBeLessThan(-13.5)
  })

  it("measures an episode's loudness, and gives nothing for bytes it can't read", async () => {
    const loud = await ffmpegLoudness()(tone(3, 16000))
    const quiet = await ffmpegLoudness()(tone(3, 1000))
    expect(loud!).toBeGreaterThan(quiet! + 20)
    expect(await ffmpegLoudness()(new Uint8Array([1, 2, 3, 4]))).toBeUndefined()
  })
})

describe('retries', () => {
  it('retries retryable errors with backoff, then succeeds', async () => {
    const delays: number[] = []
    let n = 0
    const r = await withRetry(
      async () => {
        if (++n < 3) throw new ProviderError('busy', true, 503)
        return 'ok'
      },
      { sleep: async (ms) => void delays.push(ms) },
    )
    expect(r).toBe('ok')
    expect(delays).toEqual([1000, 2000])
  })

  it('does not retry a bad request', async () => {
    let n = 0
    await expect(withRetry(async () => { n++; throw new ProviderError('bad', false, 400) }, { sleep: async () => {} })).rejects.toThrow('bad')
    expect(n).toBe(1)
  })

  it('waits as long as a rate-limited provider asks, and keeps trying longer', async () => {
    const delays: number[] = []
    let n = 0
    const limited = () => new ProviderError('Gemini TTS returned 429: Rate limit exceeded. Please retry in 38s or upgrade.', true, 429)
    const r = await withRetry(
      async () => {
        if (++n < 6) throw limited()
        return 'ok'
      },
      { sleep: async (ms) => void delays.push(ms) },
    )
    expect(r).toBe('ok')
    expect(n).toBe(6) // beyond the usual 4 tries
    expect(delays.every((d) => d >= 38_000 && d <= 91_000)).toBe(true)
    expect(retryAfterMs(limited())).toBe(38_000)
  })

  it('paces calls to a per-minute limit across all callers', async () => {
    let now = 0
    const clock = { now: () => now, sleep: async (ms: number) => void (now += ms) }
    const startedAt: number[] = []
    const call = perMinute(async (x: number) => (startedAt.push(now), x), 3, clock)
    const out = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((x) => call(x)))
    expect(out).toEqual([1, 2, 3, 4, 5, 6, 7])
    // At most 3 starts in any rolling minute.
    for (const t of startedAt) expect(startedAt.filter((u) => u >= t && u < t + 60_000).length).toBeLessThanOrEqual(3)
    expect(startedAt.slice(0, 3)).toEqual([0, 0, 0])
    expect(startedAt[3]).toBeGreaterThanOrEqual(60_000)
  })

  it('limits concurrency and keeps order', async () => {
    let inFlight = 0
    let peak = 0
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (x) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return x * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50])
    expect(peak).toBe(2)
  })
})

describe('ElevenLabs guide voice (Eleven v4 Turbo)', () => {
  const pcm = (sec: number) => new Uint8Array(Math.round(sec * 24000) * 2)
  const encode = async (wav: Uint8Array) => ({ audio: wav, mimeType: 'audio/wav' })

  it("reads a mixed line in the guide's own voice, unpinned, at the guide's pace", async () => {
    let url = ''
    let body: any
    let headers: Record<string, string> = {}
    const s = elevenLabsSpeech('k3y', encode, {
      voiceId: elevenVoiceFor,
      fetchImpl: (async (u: string, init?: RequestInit) => {
        url = String(u)
        headers = init!.headers as Record<string, string>
        body = JSON.parse(String(init!.body))
        return new Response(pcm(1.5))
      }) as typeof fetch,
    })
    expect(s.mixedLanguage).toBe(true)
    const r = await s.synthesize({ text: 'Swedes call it fika.', voice: 'Sulafat', style: 'warm', language: 'en', mixed: true })
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/hpp4J3VqNfWAUOO0d1Us?output_format=pcm_24000')
    expect(headers['xi-api-key']).toBe('k3y')
    expect(body).toEqual({ text: 'Swedes call it fika.', model_id: 'eleven_v4_turbo', voice_settings: { speed: 0.9 } })
    expect(r.durationSec).toBeCloseTo(1.5, 3)
    expect(r.usage).toEqual({ elevenTtsChars: 20 })
  })

  it('pins a lone target word to its language and reads it slowly; Leo is Charlie', async () => {
    let body: any
    let url = ''
    const s = elevenLabsSpeech('k', encode, { voiceId: elevenVoiceFor, fetchImpl: (async (u: string, init?: RequestInit) => ((url = String(u)), (body = JSON.parse(String(init!.body))), new Response(pcm(0.5)))) as typeof fetch })
    await s.synthesize({ text: 'försenad', voice: guideById('leo').voice, style: 'warm', language: 'sv', rate: 0.8 })
    expect(url).toContain('/IKne3meq5aSn9XLyUdCD?')
    expect(body).toMatchObject({ language_code: 'sv', voice_settings: { speed: 0.8 } })
  })

  it('reports refusals the same way as the other providers', async () => {
    const s = elevenLabsSpeech('k', encode, { fetchImpl: (async () => new Response('voice_not_found', { status: 404 })) as typeof fetch })
    await expect(s.synthesize({ text: 'x', voice: 'v', style: '', language: 'en' })).rejects.toMatchObject({ retryable: false })
    const busy = elevenLabsSpeech('k', encode, { fetchImpl: (async () => new Response('too_many_concurrent_requests', { status: 429 })) as typeof fetch })
    await expect(busy.synthesize({ text: 'x', voice: 'v', style: '', language: 'en' })).rejects.toMatchObject({ retryable: true })
  })

  it("checks the model against the account's list, finding v4 Turbo there if the name differs", async () => {
    const list = (ids: string[]) => (async () => Response.json(ids.map((model_id) => ({ model_id, can_do_text_to_speech: true })))) as unknown as typeof fetch
    expect(await resolveElevenModel('k', undefined, list(['eleven_v4', 'eleven_v4_turbo']))).toBe('eleven_v4_turbo')
    expect(await resolveElevenModel('k', undefined, list(['eleven_v4', 'eleven_v4_turbo_v2']))).toBe('eleven_v4_turbo_v2')
    expect(await resolveElevenModel('k', undefined, (async () => new Response('', { status: 401 })) as unknown as typeof fetch)).toBe('eleven_v4_turbo')
  })

  it('maps each guide to its ElevenLabs voice', () => {
    expect(elevenVoiceFor(guideById('mia').voice)).toBe('hpp4J3VqNfWAUOO0d1Us')
    expect(elevenVoiceFor(guideById('leo').voice)).toBe('IKne3meq5aSn9XLyUdCD')
    expect(elevenVoiceFor('someOtherId')).toBe('someOtherId')
  })
})

describe('choosing the guide voice', () => {
  it('defaults to ElevenLabs with no Railway change, and switches back to Chirp on request', () => {
    expect(chooseTtsProvider({ ELEVENLABS_API_KEY: 'e', GOOGLE_TTS_API_KEY: 'g' })).toBe('elevenlabs')
    expect(chooseTtsProvider({ TTS_PROVIDER: 'chirp', ELEVENLABS_API_KEY: 'e', GOOGLE_TTS_API_KEY: 'g' })).toBe('chirp')
    expect(chooseTtsProvider({ TTS_PROVIDER: 'CHIRP', ELEVENLABS_API_KEY: 'e' })).toBe('elevenlabs')
    expect(chooseTtsProvider({ GOOGLE_TTS_API_KEY: 'g' })).toBe('chirp')
    expect(chooseTtsProvider({ TTS_PROVIDER: 'gemini', ELEVENLABS_API_KEY: 'e' })).toBe('gemini')
    expect(chooseTtsProvider({})).toBe('gemini')
  })

  it('has Chirp read a line ElevenLabs refuses outright, telling Finlay once; busy errors are retried instead', async () => {
    const told: string[] = []
    const ok = { synthesize: async () => ({ audio: new Uint8Array(1), mimeType: 'audio/wav', durationSec: 1, usage: { ttsChars: 1 } }) }
    const refusing = { mixedLanguage: true, synthesize: async () => { throw new ProviderError('ElevenLabs TTS returned 404: voice_not_found', false, 404) } }
    const s = withFallbackSpeech(refusing, ok, (m) => told.push(m))
    expect(s.mixedLanguage).toBe(true)
    expect((await s.synthesize({ text: 'a', voice: 'v', style: '', language: 'en' })).usage).toEqual({ ttsChars: 1 })
    await s.synthesize({ text: 'b', voice: 'v', style: '', language: 'en' })
    expect(told).toHaveLength(1)
    const busy = withFallbackSpeech({ synthesize: async () => { throw new ProviderError('429', true, 429) } }, ok)
    await expect(busy.synthesize({ text: 'a', voice: 'v', style: '', language: 'en' })).rejects.toMatchObject({ retryable: true })
  })
})
