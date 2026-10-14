/**
 * List prices in US dollars, checked 12 Oct 2026 (spec Research tab). Update here when providers change prices.
 */
export const PRICES = {
  /** ElevenLabs Scribe v2, per second of audio ($0.22 an hour). */
  transcriptionPerSec: 0.22 / 3600,
  /**
   * Scribe's edit instruction (used to spell show and host names right) adds 30% to transcription,
   * billed for at least 10 seconds a request. Experimental at ElevenLabs since 28 Sep 2026.
   */
  transcriptEditPerSec: (0.3 * 0.22) / 3600,
  /**
   * Gemini 3.8 Flash at the standard rate, per token (2026 price; Google lists a rise on 1 Jan 2027).
   * Not batch: batch targets up to 24 hours, too slow for a learner waiting on their episode.
   */
  textInPerToken: 0.75 / 1e6,
  textOutPerToken: 3.75 / 1e6,
  /** Gemini 3.8 Flash TTS, per audio second of output (25 tokens a second at $9 per million). */
  ttsPerAudioSec: (25 * 9) / 1e6,
  /** Google Cloud Text-to-Speech, Chirp 3 HD voices, per character ($30 per million; first 1M a month free). */
  ttsPerChar: 30 / 1e6,
} as const

/** Guide speech runs at about 15 characters a second, for estimating per-character voices. */
export const SPEECH_CHARS_PER_SEC = 15

export interface Usage {
  transcriptionSec: number
  textInTokens: number
  textOutTokens: number
  ttsAudioSec: number
  /** Characters sent to a per-character voice (Chirp 3 HD). */
  ttsChars?: number
  /** Audio seconds that also had Scribe's name-spelling edit applied. */
  transcriptEditSec?: number
}

export const ZERO_USAGE: Usage = { transcriptionSec: 0, textInTokens: 0, textOutTokens: 0, ttsAudioSec: 0 }

export function addUsage(a: Usage, b: Partial<Usage>): Usage {
  return {
    transcriptionSec: a.transcriptionSec + (b.transcriptionSec ?? 0),
    textInTokens: a.textInTokens + (b.textInTokens ?? 0),
    textOutTokens: a.textOutTokens + (b.textOutTokens ?? 0),
    ttsAudioSec: a.ttsAudioSec + (b.ttsAudioSec ?? 0),
    ttsChars: (a.ttsChars ?? 0) + (b.ttsChars ?? 0),
    transcriptEditSec: (a.transcriptEditSec ?? 0) + (b.transcriptEditSec ?? 0),
  }
}

export function costUSD(u: Usage): number {
  return (
    u.transcriptionSec * PRICES.transcriptionPerSec +
    u.textInTokens * PRICES.textInPerToken +
    u.textOutTokens * PRICES.textOutPerToken +
    u.ttsAudioSec * PRICES.ttsPerAudioSec +
    (u.ttsChars ?? 0) * PRICES.ttsPerChar +
    (u.transcriptEditSec ?? 0) * PRICES.transcriptEditPerSec
  )
}

/** Hands-on guide speech per hour of episode: about 15 minutes. */
export const GUIDE_SPEECH_RATIO = 0.25

/** Expected cost to prepare an episode before it runs, for allowance checks and the spending cap. */
export function estimatePrepUsage(durationSec: number, opts: { feedTranscript?: boolean } = {}): Usage {
  const hours = durationSec / 3600
  return {
    transcriptionSec: opts.feedTranscript ? 0 : durationSec,
    // Every transcription carries the name-spelling instruction.
    transcriptEditSec: opts.feedTranscript ? 0 : Math.max(10, durationSec),
    // Translation, lesson plan and glossary.
    textInTokens: Math.round(45_000 * hours),
    textOutTokens: Math.round(30_000 * hours),
    // The guide's voice is Chirp 3 HD (per character) since 13 Oct 2026; see docs/DECISIONS.md.
    ttsAudioSec: 0,
    ttsChars: Math.round(durationSec * GUIDE_SPEECH_RATIO * SPEECH_CHARS_PER_SEC),
  }
}

export function estimatePrepCostUSD(durationSec: number, opts: { feedTranscript?: boolean } = {}): number {
  return costUSD(estimatePrepUsage(durationSec, opts))
}
