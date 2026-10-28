import { errorFromResponse, ProviderError, type SpeechSynth, type TextModel } from './types'
import { wavDurationSec } from '../audio'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/interactions'

/**
 * Google stores requests by default (store=true) since 26 Oct 2026. Every request Polycast sends
 * to Gemini carries store: false, so learners' text and hosts' transcripts don't sit on Google's
 * servers (PC-1027-01). server/test/geminiStore.test.ts fails a request that forgets it.
 */
export const GEMINI_STORE = false

export const GEMINI_MODELS = {
  text: 'gemini-3.8-flash',
  /** Show titles and descriptions (PC-1017-T1): short, simple translations. */
  textLite: 'gemini-3.8-flash-lite',
  tts: 'gemini-3.8-flash-tts',
  /** A third cheaper; only the voice audition uses it so far (server/src/audition.ts). */
  ttsLite: 'gemini-3.8-flash-lite-tts',
} as const

/** Finds the reply's text and audio wherever the Interactions API puts them. */
export function readInteraction(json: any): { text?: string; audioBase64?: string } {
  if (typeof json?.output_text === 'string') return { text: json.output_text }
  let text: string | undefined
  let audioBase64: string | undefined
  for (const step of json?.steps ?? []) {
    if (step?.type !== 'model_output') continue
    for (const c of step.content ?? []) {
      if (c?.type === 'text' && typeof c.text === 'string') text = (text ?? '') + c.text
      if (c?.type === 'audio' && typeof c.data === 'string') audioBase64 = c.data
    }
  }
  return { text, audioBase64 }
}

/** Token counts if the reply reports them, else an estimate from length (about 4 characters a token). */
export function readTokenUsage(json: any, promptChars: number, replyChars: number): { textInTokens: number; textOutTokens: number } {
  const u = json?.usage ?? json?.usage_metadata ?? json?.usageMetadata ?? {}
  const inTok = u.total_input_tokens ?? u.input_tokens ?? u.promptTokenCount
  const outTok = u.total_output_tokens ?? u.output_tokens ?? u.candidatesTokenCount
  return {
    textInTokens: typeof inTok === 'number' ? inTok : Math.ceil(promptChars / 4),
    textOutTokens: typeof outTok === 'number' ? outTok : Math.ceil(replyChars / 4),
  }
}

export function geminiText(apiKey: string, model: string = GEMINI_MODELS.text, fetchImpl: typeof fetch = fetch): TextModel {
  return {
    async generateJson<T>({ system, prompt, schema }: { system: string; prompt: string; schema: Record<string, unknown> }) {
      const input = `${system}\n\n${prompt}`
      const res = await fetchImpl(BASE, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          store: GEMINI_STORE,
          input,
          response_format: { type: 'text', mime_type: 'application/json', schema },
        }),
      })
      if (!res.ok) throw errorFromResponse('Gemini', res.status, await res.text())
      const json = await res.json()
      const { text } = readInteraction(json)
      if (!text) throw new ProviderError('Gemini reply had no text', true)
      let data: T
      try {
        data = JSON.parse(text) as T
      } catch {
        throw new ProviderError('Gemini reply was not valid JSON', true)
      }
      return { data, usage: readTokenUsage(json, input.length, text.length) }
    },
  }
}

export type Encoder = (wav: Uint8Array) => Promise<{ audio: Uint8Array; mimeType: string }>

/**
 * Gemini TTS. Replies are 24 kHz mono WAV; `encode` turns them into a small AAC file for phones.
 */
export function geminiSpeech(
  apiKey: string,
  encode: Encoder,
  model: string = GEMINI_MODELS.tts,
  fetchImpl: typeof fetch = fetch,
): SpeechSynth {
  return {
    async synthesize({ text, voice, style }) {
      const res = await fetchImpl(BASE, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          store: GEMINI_STORE,
          input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }],
          response_format: { type: 'audio' },
          generation_config: { speech_config: [{ voice }] },
        }),
      })
      if (!res.ok) throw errorFromResponse('Gemini TTS', res.status, await res.text())
      const { audioBase64 } = readInteraction(await res.json())
      if (!audioBase64) throw new ProviderError('Gemini TTS reply had no audio', true)
      const wav = Uint8Array.from(Buffer.from(audioBase64, 'base64'))
      const durationSec = wavDurationSec(wav)
      const { audio, mimeType } = await encode(wav)
      return { audio, mimeType, durationSec, usage: { ttsAudioSec: durationSec } }
    },
  }
}
