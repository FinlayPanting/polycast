import { describe, expect, it } from 'vitest'
import { ffmpegAacEncoder, silentWav, wavDurationSec } from '../src/audio'
import { wordsFromScribe, scribeTranscriber } from '../src/providers/elevenlabs'
import { geminiSpeech, geminiText, readInteraction, readTokenUsage } from '../src/providers/gemini'
import { ProviderError } from '../src/providers/types'
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

describe('audio', () => {
  it('reads WAV durations', () => {
    expect(wavDurationSec(silentWav(1.5))).toBeCloseTo(1.5, 3)
    expect(() => wavDurationSec(new Uint8Array(50))).toThrow('Not a WAV file')
  })

  it('encodes guide speech to small AAC files with ffmpeg', async () => {
    const wav = silentWav(3)
    const { audio, mimeType } = await ffmpegAacEncoder()(wav)
    expect(mimeType).toBe('audio/mp4')
    expect(audio.byteLength).toBeGreaterThan(100)
    expect(audio.byteLength).toBeLessThan(wav.byteLength / 4)
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
