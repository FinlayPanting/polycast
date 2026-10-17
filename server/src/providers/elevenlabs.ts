import { applyEditedSpellings, scribeNameInstruction, type Word } from '@polycast/core'
import { errorFromResponse, ProviderError, type SpeechSynth, type Transcriber } from './types'
import { pcmToWav, wavDurationSec } from '../audio'

interface ScribeWord {
  text: string
  start: number
  end: number
  type: 'word' | 'spacing' | 'audio_event'
  speaker_id?: string
}

/** Keeps spoken words only; audio events like "(laughter)" and spacing tokens are dropped. */
export function wordsFromScribe(words: ScribeWord[]): Word[] {
  return words
    .filter((w) => w.type === 'word' && w.text.trim().length > 0)
    .map((w) => ({ text: w.text.trim(), start: w.start, end: w.end, speaker: w.speaker_id }))
}

/**
 * ElevenLabs Scribe v2. Given the episode's bytes (downloaded once by the worker, which also
 * fingerprints them), it uploads those, so the transcript's timings match the fingerprint exactly.
 * Otherwise it sends the publisher's URL (`source_url`) and ElevenLabs fetches its own copy.
 * Either way Polycast never stores the episode.
 */
export function scribeTranscriber(apiKey: string, fetchImpl: typeof fetch = fetch): Transcriber {
  return {
    async transcribe({ audioUrl, language, durationSec, audio, names }) {
      const instruction = names ? scribeNameInstruction(names) : undefined
      const form = new FormData()
      form.set('model_id', 'scribe_v2')
      if (audio) form.set('file', new Blob([audio as BlobPart], { type: 'audio/mpeg' }), 'episode.mp3')
      else form.set('source_url', audioUrl)
      form.set('language_code', language)
      form.set('diarize', 'true')
      form.set('timestamps_granularity', 'word')
      form.set('tag_audio_events', 'false')
      // Scribe applies this after transcribing and returns `edited_transcript` beside the original.
      if (instruction) form.set('transcript_edit', instruction)
      const res = await fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
      })
      if (!res.ok) throw errorFromResponse('ElevenLabs Scribe', res.status, await res.text())
      const json = (await res.json()) as {
        language_code?: string
        words?: ScribeWord[]
        edited_transcript?: { kind: 'transcript'; text: string } | { kind: 'error'; message?: string }
      }
      const original = wordsFromScribe(json.words ?? [])
      // The timings describe the original words, so the edit only lends its spelling of names
      // to words it swaps one for one. A failed edit leaves the original transcript as it was.
      const edit = json.edited_transcript
      const words = edit?.kind === 'transcript' ? applyEditedSpellings(original, edit.text, language).words : original
      const heardSec = Math.max(original.at(-1)?.end ?? durationSec, durationSec)
      return {
        words,
        detectedLanguage: json.language_code,
        usage: { transcriptionSec: heardSec, ...(instruction ? { transcriptEditSec: Math.max(10, heardSec) } : {}) },
      }
    },
  }
}

/** Eleven v4 Turbo: Finlay's pick after the 17 Oct audition (v4 won more lines, Turbo is half the price). */
export const ELEVEN_TTS_MODEL = 'eleven_v4_turbo'
/** The guide's own pace and the slower one for a term said on its own (as with Chirp). */
export const ELEVEN_GUIDE_SPEED = 0.9
export const ELEVEN_TARGET_SPEED = 0.8
/** ElevenLabs accepts speeds from 0.7 to 1.2. */
const clampSpeed = (s: number) => Math.min(1.2, Math.max(0.7, s))

/**
 * ElevenLabs text to speech for the guide (board item PC-1017-09). One voice per guide reads every
 * language, and a mixed line ("Swedes call it [[fika]]") goes as one call with the target words
 * said natively. Raw 24 kHz PCM comes back and is encoded to AAC like the other voices.
 * `voiceId` turns the guide's voice setting into an ElevenLabs voice id.
 */
export function elevenLabsSpeech(
  apiKey: string,
  encode: (wav: Uint8Array) => Promise<{ audio: Uint8Array; mimeType: string }>,
  opts: { model?: string; voiceId?: (voice: string) => string; fetchImpl?: typeof fetch } = {},
): SpeechSynth {
  const fetchImpl = opts.fetchImpl ?? fetch
  const model = opts.model ?? ELEVEN_TTS_MODEL
  return {
    mixedLanguage: true,
    async synthesize({ text, voice, language, rate, mixed }) {
      const id = opts.voiceId ? opts.voiceId(voice) : voice
      const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}?output_format=pcm_24000`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/pcm' },
        body: JSON.stringify({
          text,
          model_id: model,
          // A line mixing two languages isn't pinned to one, so the target words keep their own sounds.
          ...(mixed ? {} : { language_code: language.slice(0, 2).toLowerCase() }),
          voice_settings: { speed: clampSpeed(rate ?? ELEVEN_GUIDE_SPEED) },
        }),
      })
      if (!res.ok) throw errorFromResponse('ElevenLabs TTS', res.status, await res.text())
      const pcm = new Uint8Array(await res.arrayBuffer())
      if (pcm.byteLength < 2) throw new ProviderError('ElevenLabs TTS reply had no audio', true)
      const wav = pcmToWav(pcm, 24000)
      const durationSec = wavDurationSec(wav)
      const { audio, mimeType } = await encode(wav)
      return { audio, mimeType, durationSec, usage: { elevenTtsChars: text.length } }
    },
  }
}

/**
 * Checks the configured model against the account's /v1/models (the key has Models access), and
 * picks the v4 Turbo id listed there if the configured one isn't. Falls back to the configured id
 * if the list can't be read.
 */
export async function resolveElevenModel(apiKey: string, wanted = ELEVEN_TTS_MODEL, fetchImpl: typeof fetch = fetch): Promise<string> {
  try {
    const res = await fetchImpl('https://api.elevenlabs.io/v1/models', { headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return wanted
    const models = (await res.json()) as { model_id?: string; can_do_text_to_speech?: boolean }[]
    const ids = models.filter((m) => m.can_do_text_to_speech !== false).map((m) => m.model_id ?? '')
    if (ids.includes(wanted)) return wanted
    return ids.find((i) => /v4/.test(i) && /turbo/.test(i)) ?? wanted
  } catch {
    return wanted
  }
}
