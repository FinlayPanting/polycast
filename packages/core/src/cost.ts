/**
 * List prices in US dollars, checked 12 Oct 2026 (spec Research tab). Update here when providers change prices.
 */
export const PRICES = {
  /** ElevenLabs Scribe v2, per second of audio ($0.22 an hour). */
  transcriptionPerSec: 0.22 / 3600,
  /** Gemini Flash via batch, per token (2026 batch rates for 3.6 Flash). */
  textInPerToken: 0.375 / 1e6,
  textOutPerToken: 1.875 / 1e6,
  /** Gemini 3.8 Flash TTS, per audio second of output (25 tokens a second at $9 per million). */
  ttsPerAudioSec: (25 * 9) / 1e6,
} as const

export interface Usage {
  transcriptionSec: number
  textInTokens: number
  textOutTokens: number
  ttsAudioSec: number
}

export const ZERO_USAGE: Usage = { transcriptionSec: 0, textInTokens: 0, textOutTokens: 0, ttsAudioSec: 0 }

export function addUsage(a: Usage, b: Partial<Usage>): Usage {
  return {
    transcriptionSec: a.transcriptionSec + (b.transcriptionSec ?? 0),
    textInTokens: a.textInTokens + (b.textInTokens ?? 0),
    textOutTokens: a.textOutTokens + (b.textOutTokens ?? 0),
    ttsAudioSec: a.ttsAudioSec + (b.ttsAudioSec ?? 0),
  }
}

export function costUSD(u: Usage): number {
  return (
    u.transcriptionSec * PRICES.transcriptionPerSec +
    u.textInTokens * PRICES.textInPerToken +
    u.textOutTokens * PRICES.textOutPerToken +
    u.ttsAudioSec * PRICES.ttsPerAudioSec
  )
}

/** Hands-on guide speech per hour of episode: about 15 minutes. */
export const GUIDE_SPEECH_RATIO = 0.25

/** Expected cost to prepare an episode before it runs, for allowance checks and the spending cap. */
export function estimatePrepUsage(durationSec: number, opts: { feedTranscript?: boolean } = {}): Usage {
  const hours = durationSec / 3600
  return {
    transcriptionSec: opts.feedTranscript ? 0 : durationSec,
    textInTokens: Math.round(30_000 * hours),
    textOutTokens: Math.round(16_000 * hours),
    ttsAudioSec: durationSec * GUIDE_SPEECH_RATIO,
  }
}

export function estimatePrepCostUSD(durationSec: number, opts: { feedTranscript?: boolean } = {}): number {
  return costUSD(estimatePrepUsage(durationSec, opts))
}
