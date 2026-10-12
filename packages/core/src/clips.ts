import { normalizeToken, tokenize } from './text'
import type { Clip, Segment, Word } from './types'

export interface Occurrence {
  /** First and last word index of the match, inclusive. */
  first: number
  last: number
  start: number
  end: number
}

/** Every place the host says a word or phrase, matched on normalised tokens. */
export function findOccurrences(words: Word[], phrase: string, language?: string): Occurrence[] {
  const target = tokenize(phrase, language)
  if (target.length === 0) return []
  const norm = words.map((w) => normalizeToken(w.text, language))
  const found: Occurrence[] = []
  for (let i = 0; i + target.length <= norm.length; i++) {
    if (target.every((t, k) => norm[i + k] === t)) {
      const last = i + target.length - 1
      found.push({ first: i, last, start: words[i]!.start, end: words[last]!.end })
    }
  }
  return found
}

/**
 * The clip of the host saying a word: the word's own timing with a little padding,
 * never reaching into the neighbouring words.
 */
export function wordClip(words: Word[], occ: Occurrence, pad = 0.12): Clip {
  const prevEnd = occ.first > 0 ? words[occ.first - 1]!.end : 0
  const nextStart = occ.last < words.length - 1 ? words[occ.last + 1]!.start : occ.end + pad
  return {
    start: Math.max(0, prevEnd, occ.start - pad),
    end: Math.min(nextStart, occ.end + pad),
  }
}

/** The clip of the whole subtitle line the word sits in, for replaying the host's sentence. */
export function sentenceClip(segments: Segment[], wordIndex: number, pad = 0.1): Clip | undefined {
  const seg = segments.find((s) => wordIndex >= s.wordStart && wordIndex < s.wordEnd)
  if (!seg) return undefined
  return { start: Math.max(0, seg.start - pad), end: seg.end + pad }
}
