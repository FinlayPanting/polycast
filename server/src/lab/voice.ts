import { createHash } from 'node:crypto'
import { voiceSegments } from '@polycast/core'
import { errorFromResponse, ProviderError, type SpeechSynth, type Storage } from '../providers/types'
import { ELEVEN_GUIDE_SPEED, ELEVEN_TARGET_SPEED } from '../providers/elevenlabs'
import { geminiSpeech } from '../providers/gemini'
import { googleChirpSpeech } from '../providers/googleTts'
import { withRetry } from '../retry'
import type { AudioEffects } from '../roomAudition'
import { GUIDES } from '../voices'
import { MISTRAL_TTS_MODEL, voiceCostUSD, type VoiceProvider } from './prices'
import { isSoundPreset, joinWavs, LAB_RATE, LINE_GAP_SEC, runFfmpeg, fixWavSizes, silence, tidyLine, toMp3, type SoundPreset } from './sound'
import { wavDurationSec } from '../audio'

/** One way of voicing a line: which voice, how fast, and how it should sound. */
export interface Take {
  provider: VoiceProvider
  /** ElevenLabs model id, or a Gemini TTS model; ignored for Chirp. */
  model?: string
  /** ElevenLabs voice id, or a Chirp/Gemini voice name such as Sulafat. */
  voice: string
  /** Speaking rate, 1 = normal; the app uses 0.9 for the guide. */
  speed?: number
  /** ElevenLabs' own audio effects (ElevenLabs only). */
  effects?: AudioEffects | null
  /** Polycast's own gentle sound settings, applied after voicing (any voice, free). */
  sound?: SoundPreset
}

export interface LineRequest {
  /** What the guide says. Target-language words go in [[ ]], as in real lesson scripts. */
  text: string
  /** The language the guide speaks (the learner's own). */
  nativeLanguage: string
  /** The language being learnt, for anything in [[ ]]. */
  targetLanguage: string
}

export interface LabKeys {
  elevenlabs?: string
  googleTts?: string
  gemini?: string
  anthropic?: string
  /** Mistral's Voxtral voices (PC-1022-09), from MISTRAL_API_KEY. */
  mistral?: string
}

export interface VoicedTake {
  wav: Uint8Array
  durationSec: number
  costUSD: number
  chars: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Checks a take from the page: unknown fields dropped, numbers kept in range. */
export function cleanTake(t: any): Take {
  const provider: VoiceProvider = t?.provider === 'chirp' || t?.provider === 'gemini' || t?.provider === 'mistral' ? t.provider : 'elevenlabs'
  const voice = typeof t?.voice === 'string' && /^[\w.-]{1,80}$/.test(t.voice) ? t.voice : provider === 'elevenlabs' ? GUIDES[0]!.elevenLabsVoiceId : GUIDES[0]!.voice
  const model = typeof t?.model === 'string' && /^[\w.-]{1,80}$/.test(t.model) ? t.model : undefined
  const speed = typeof t?.speed === 'number' && Number.isFinite(t.speed) ? clamp(t.speed, 0.7, 1.2) : undefined
  let effects: AudioEffects | null = null
  if (provider === 'elevenlabs' && t?.effects && typeof t.effects === 'object') {
    const e = t.effects
    effects = {}
    if (typeof e.filter_preset_id === 'string' && /^[\w.-]{1,80}$/.test(e.filter_preset_id)) effects.filter_preset_id = e.filter_preset_id
    if (typeof e.environment_id === 'string' && /^[\w.-]{1,80}$/.test(e.environment_id)) effects.environment_id = e.environment_id
    if (typeof e.distance === 'number' && Number.isFinite(e.distance)) effects.distance = clamp(e.distance, 0, 1)
    if (typeof e.send_level === 'number' && Number.isFinite(e.send_level)) effects.send_level = clamp(e.send_level, 0, 1)
    if (Object.keys(effects).length === 0) effects = null
  }
  return { provider, voice, ...(model ? { model } : {}), ...(speed ? { speed } : {}), effects, sound: isSoundPreset(t?.sound) ? t.sound : 'dry' }
}

/** A stable name for a take of a line, so the same take is never paid for twice. */
export function takeHash(take: Take, line: LineRequest): string {
  const key = JSON.stringify({ v: 1, ...take, effects: take.effects ?? null, sound: take.sound ?? 'dry', ...line })
  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}

/** ElevenLabs text to speech as MP3 (the format its stereo effects come back in). */
async function elevenMp3(key: string, req: { text: string; voiceId: string; model: string; speed: number; language?: string; effects?: AudioEffects | null }, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: req.text,
      model_id: req.model,
      ...(req.language ? { language_code: req.language } : {}),
      voice_settings: { speed: clamp(req.speed, 0.7, 1.2) },
      ...(req.effects ? { audio_effects: req.effects } : {}),
    }),
  })
  if (!res.ok) throw errorFromResponse('ElevenLabs TTS', res.status, await res.text())
  const audio = new Uint8Array(await res.arrayBuffer())
  if (audio.byteLength < 2) throw new ProviderError('ElevenLabs TTS reply had no audio', true)
  return audio
}

/**
 * Mistral Voxtral text to speech (PC-1022-09) as MP3. Mistral answers with JSON carrying the audio
 * as base64 (`audio_data`); a plain audio reply is accepted too. It has no speed or language
 * setting: it reads the whole line, target words included, in one go.
 */
export async function mistralMp3(key: string, req: { text: string; voiceId: string; model?: string }, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const res = await fetchImpl('https://api.mistral.ai/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: req.model ?? MISTRAL_TTS_MODEL, input: req.text, voice_id: req.voiceId, response_format: 'mp3' }),
  })
  if (!res.ok) throw errorFromResponse('Mistral TTS', res.status, await res.text())
  let audio: Uint8Array
  if ((res.headers.get('content-type') ?? '').includes('json')) {
    const body = (await res.json()) as { audio_data?: string }
    audio = new Uint8Array(Buffer.from(body.audio_data ?? '', 'base64'))
  } else audio = new Uint8Array(await res.arrayBuffer())
  if (audio.byteLength < 2) throw new ProviderError('Mistral TTS reply had no audio', true)
  return audio
}

const asWav = async (wav: Uint8Array) => ({ audio: wav, mimeType: 'audio/wav' })

/**
 * Voices a line with a take, the way the pipeline does (server/src/pipeline/voice.ts): words in
 * [[ ]] are said in the target language, more slowly; ElevenLabs and Mistral read a mixed line in one go.
 * Then the line gets the app's tidy-up and the take's sound setting.
 */
export async function voiceLine(take: Take, line: LineRequest, keys: LabKeys, opts: { fetchImpl?: typeof fetch; elevenModel?: string; now?: Date } = {}): Promise<VoicedTake> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const mixed = take.provider === 'elevenlabs' || take.provider === 'mistral'
  const runs = voiceSegments(line.text, { mixed })
  if (runs.length === 0) throw new Error('Nothing to say')
  const raw: Uint8Array[] = []
  let chars = 0
  let audioSec = 0
  for (const run of runs) {
    const language = run.target ? line.targetLanguage : line.nativeLanguage
    chars += run.text.length
    if (take.provider === 'elevenlabs') {
      if (!keys.elevenlabs) throw new Error('ElevenLabs isn’t set up on the server (ELEVENLABS_API_KEY).')
      const speed = run.target ? ELEVEN_TARGET_SPEED * (take.speed ?? ELEVEN_GUIDE_SPEED) / ELEVEN_GUIDE_SPEED : take.speed ?? ELEVEN_GUIDE_SPEED
      raw.push(
        await withRetry(() =>
          elevenMp3(keys.elevenlabs!, {
            text: run.text,
            voiceId: take.voice,
            model: take.model ?? opts.elevenModel ?? 'eleven_v4_turbo',
            speed,
            // A mixed line isn't pinned to one language, so its target words keep their own sounds.
            language: mixed && !run.target ? undefined : language.slice(0, 2).toLowerCase(),
            effects: take.effects,
          }, fetchImpl),
        ),
      )
      continue
    }
    if (take.provider === 'mistral') {
      if (!keys.mistral) throw new Error('Mistral isn’t set up on the server (MISTRAL_API_KEY).')
      raw.push(await withRetry(() => mistralMp3(keys.mistral!, { text: run.text, voiceId: take.voice, model: take.model }, fetchImpl)))
      continue
    }
    let speech: SpeechSynth
    if (take.provider === 'chirp') {
      if (!keys.googleTts) throw new Error('Chirp isn’t set up on the server (GOOGLE_TTS_API_KEY).')
      speech = googleChirpSpeech(keys.googleTts, asWav, { fetchImpl })
    } else {
      if (!keys.gemini) throw new Error('Gemini isn’t set up on the server (GEMINI_API_KEY).')
      speech = geminiSpeech(keys.gemini, asWav, take.model ?? 'gemini-3.8-flash-tts', fetchImpl)
    }
    const rate = run.target ? 0.8 * (take.speed ?? 0.9) / 0.9 : take.speed ?? 0.9
    const r = await withRetry(() => speech.synthesize({ text: run.text, voice: take.voice, style: GUIDES[0]!.style, language, rate }))
    audioSec += r.durationSec
    raw.push(r.audio)
  }
  // Each run is tidied on its own (as the app's lines are), then joined.
  const tidied = await Promise.all(raw.map((a) => tidyLine(a, take.sound ?? 'dry')))
  // The app leaves 120 ms between a moment's lines (GAP_BETWEEN_LINES_MS in GuidedListen.ts).
  const gap = silence(LINE_GAP_SEC)
  const wav = tidied.length === 1 ? tidied[0]!.wav : joinWavs(tidied.flatMap((t, i) => (i ? [gap, t.wav] : [t.wav])))
  const durationSec = tidied.reduce((a, t) => a + t.durationSec, 0) + LINE_GAP_SEC * (tidied.length - 1)
  const costUSD = voiceCostUSD(take.provider, take.model ?? '', chars, audioSec || durationSec, opts.now)
  return { wav, durationSec, costUSD, chars }
}

export interface StoredTake {
  hash: string
  url: string
  durationSec: number
  costUSD: number
  cached: boolean
}

/**
 * Voices a take unless the same take of the same line is already stored, in which case it's free.
 * Stored as MP3 with a small JSON note beside it (length and what it cost first time).
 */
export async function voiceAndStore(take: Take, line: LineRequest, deps: { keys: LabKeys; storage: Storage; fetchImpl?: typeof fetch; elevenModel?: string }): Promise<StoredTake & { wav?: Uint8Array }> {
  const hash = takeHash(take, line)
  const path = `lab/voice/${hash}.mp3`
  const existing = await deps.storage.exists?.(path)
  if (existing) {
    const meta = await (deps.fetchImpl ?? fetch)(existing.replace(/\.mp3$/, '.json')).then((r) => (r.ok ? r.json() : {})).catch(() => ({})) as { durationSec?: number }
    return { hash, url: existing, durationSec: meta.durationSec ?? 0, costUSD: 0, cached: true }
  }
  const v = await voiceLine(take, line, deps.keys, { fetchImpl: deps.fetchImpl, elevenModel: deps.elevenModel })
  const url = await deps.storage.put(path, await toMp3(v.wav), 'audio/mpeg')
  await deps.storage.put(`lab/voice/${hash}.json`, new TextEncoder().encode(JSON.stringify({ durationSec: v.durationSec, costUSD: v.costUSD, chars: v.chars, take, line })), 'application/json')
  return { hash, url, durationSec: v.durationSec, costUSD: v.costUSD, cached: false, wav: v.wav }
}

/** Any stored audio (MP3 or M4A) back to a Lab-format WAV, for joining into a preview. */
export async function decodeToWav(audio: Uint8Array): Promise<{ wav: Uint8Array; durationSec: number }> {
  const { out } = await runFfmpeg(['-loglevel', 'error', '-i', 'pipe:0', '-ar', String(LAB_RATE), '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav', '-rf64', 'never', 'pipe:1'], audio)
  const wav = fixWavSizes(out)
  return { wav, durationSec: wavDurationSec(wav) }
}
