import { pricesOn } from '@polycast/core'

/**
 * Prices for the Lab (PC-1021-L1): what each voice and text model costs, so every test shows its cost
 * before and after it runs. Voices and Gemini come from @polycast/core's price table (the one the
 * spending cap uses); models the app doesn't use yet are listed here.
 */

export type VoiceProvider = 'elevenlabs' | 'chirp' | 'gemini' | 'mai'

/**
 * Microsoft MAI-Voice-2.1 through OpenRouter (PC-1024-05), released 1 Oct 2026: $22 per million
 * characters (OpenRouter's listing, checked 25 Oct 2026). Lab only.
 */
export const MAI_TTS_MODEL = 'microsoft/mai-voice-2.1'
export const MAI_TTS_PER_CHAR = 22 / 1e6

export interface TextModelInfo {
  id: string
  label: string
  provider: 'gemini' | 'anthropic'
  /** US dollars per token, in and out, for a prompt of `promptTokens`. */
  price(promptTokens: number, at?: Date): { in: number; out: number }
  note?: string
}

/**
 * Claude Haiku 5.5 (7 Oct 2026): $0.10 in and $0.50 out per million tokens for prompts up to 100K
 * tokens, $0.50 and $2.50 above that (anthropic.com/claude-haiku-5-5, checked 21 Oct 2026).
 */
export const HAIKU_LONG_PROMPT_TOKENS = 100_000

export const TEXT_MODELS: TextModelInfo[] = [
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash (today’s lesson writer)',
    provider: 'gemini',
    price: (_p, at) => ({ in: pricesOn(at).textInPerToken, out: pricesOn(at).textOutPerToken }),
  },
  {
    id: 'gemini-3.8-flash-lite',
    label: 'Gemini 3.8 Flash-Lite',
    provider: 'gemini',
    // The price table has no Flash-Lite text price, so it's counted at Flash rates: an upper bound.
    price: (_p, at) => ({ in: pricesOn(at).textInPerToken, out: pricesOn(at).textOutPerToken }),
    note: 'Cost shown at Flash rates (an upper bound).',
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    provider: 'anthropic',
    price: (p) => (p > HAIKU_LONG_PROMPT_TOKENS ? { in: 0.5 / 1e6, out: 2.5 / 1e6 } : { in: 0.1 / 1e6, out: 0.5 / 1e6 }),
  },
]

export function textModel(id: string): TextModelInfo | undefined {
  return TEXT_MODELS.find((m) => m.id === id)
}

export function textCostUSD(modelId: string, inTokens: number, outTokens: number, at?: Date): number {
  const m = textModel(modelId)
  if (!m) return 0
  const p = m.price(inTokens, at)
  return inTokens * p.in + outTokens * p.out
}

/** Roughly 4 characters a token, for estimates before a call. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 4)

/** Guide speech runs at about 15 characters a second. */
export const CHARS_PER_SEC = 15

/** Gemini TTS models the Lab can use, by id, with their price key. */
export const GEMINI_TTS = {
  'gemini-3.8-flash-tts': 'ttsPerAudioSec',
  'gemini-3.8-flash-lite-tts': 'ttsLitePerAudioSec',
} as const

/** What one take costs: per character for ElevenLabs, Chirp and MAI-Voice, per audio second for Gemini. */
export function voiceCostUSD(provider: VoiceProvider, model: string, chars: number, audioSec: number, at?: Date): number {
  const p = pricesOn(at)
  if (provider === 'elevenlabs') return chars * p.elevenTtsPerChar
  if (provider === 'chirp') return chars * p.ttsPerChar
  if (provider === 'mai') return chars * MAI_TTS_PER_CHAR
  const key = GEMINI_TTS[model as keyof typeof GEMINI_TTS] ?? 'ttsPerAudioSec'
  return audioSec * p[key]
}

export function estimateVoiceUSD(provider: VoiceProvider, model: string, chars: number, at?: Date): number {
  return voiceCostUSD(provider, model, chars, chars / CHARS_PER_SEC, at)
}

/** What an hour of guide speech costs on a voice, for comparing at a glance. */
export function voicePerHourUSD(provider: VoiceProvider, model: string, at?: Date): number {
  return estimateVoiceUSD(provider, model, 3600 * CHARS_PER_SEC, at)
}
