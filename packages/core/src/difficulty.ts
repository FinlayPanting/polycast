import { normalizeToken } from './text'
import type { Word } from './types'

export type DifficultyBand = 'easier' | 'moderate' | 'challenging'

export interface Difficulty {
  /** Words per minute of speech, pauses excluded. */
  wpm: number
  /** Share of words within the language's 3,000 most common, when a frequency list is available. */
  commonCoverage?: number
  band: DifficultyBand
  /** Shown on episode pages, e.g. "A2–B1, relaxed pace". */
  label: string
}

export interface DifficultyOptions {
  /** Frequency rank of a normalised word (1 = most common), if a list exists for the language. */
  rankOf?: (token: string) => number | undefined
  language?: string
}

/**
 * Estimates how hard an episode is to follow from speaking speed and how common its words are
 * (spec: "Easy listening" shelf and episode difficulty estimates).
 */
export function estimateDifficulty(words: Word[], opts: DifficultyOptions = {}): Difficulty {
  const speaking = words.reduce((s, w) => s + Math.max(0, w.end - w.start), 0)
  const wpm = speaking > 0 ? (words.length / speaking) * 60 : 0

  let commonCoverage: number | undefined
  if (opts.rankOf && words.length > 0) {
    let known = 0
    let counted = 0
    for (const w of words) {
      const t = normalizeToken(w.text, opts.language)
      if (!t || /^\d+$/.test(t)) continue
      counted++
      const r = opts.rankOf(t)
      if (r !== undefined && r <= 3000) known++
    }
    commonCoverage = counted > 0 ? known / counted : undefined
  }

  // Speed thresholds use time actually speaking, so they run higher than conversational wpm figures.
  let score = wpm < 150 ? 0 : wpm < 185 ? 1 : 2
  if (commonCoverage !== undefined) score += commonCoverage >= 0.92 ? 0 : commonCoverage >= 0.85 ? 1 : 2
  const max = commonCoverage === undefined ? 2 : 4
  const ratio = score / max
  const band: DifficultyBand = ratio <= 0.25 ? 'easier' : ratio <= 0.6 ? 'moderate' : 'challenging'
  const pace = wpm < 150 ? 'relaxed pace' : wpm < 185 ? 'natural pace' : 'fast pace'
  const level = band === 'easier' ? 'A2–B1' : band === 'moderate' ? 'B1–B2' : 'B2+'
  return { wpm: Math.round(wpm), commonCoverage, band, label: `${level}, ${pace}` }
}
