import { endsSentence } from './text'
import type { Word } from './types'

/** A pause between two words where the guide may speak. */
export interface Break {
  /** Time to start the guide: the end of the word before the pause. */
  at: number
  gap: number
  /** Index of the word just before the pause. */
  afterWord: number
  sentenceEnd: boolean
  speakerChange: boolean
}

export interface BreakOptions {
  /** Any pause this long counts, even mid-sentence. */
  minGap?: number
  /** A sentence end only needs a pause this long. */
  minSentenceGap?: number
}

/**
 * Finds the pauses where the guide can speak without cutting anyone off: sentence ends
 * with at least a short pause, or any long pause.
 */
export function findBreaks(words: Word[], opts: BreakOptions = {}): Break[] {
  const minGap = opts.minGap ?? 0.9
  const minSentenceGap = opts.minSentenceGap ?? 0.25
  const breaks: Break[] = []
  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i]!
    const next = words[i + 1]!
    const gap = next.start - w.end
    const sentenceEnd = endsSentence(w.text)
    if (gap >= minGap || (sentenceEnd && gap >= minSentenceGap)) {
      breaks.push({
        at: w.end,
        gap,
        afterWord: i,
        sentenceEnd,
        speakerChange: (w.speaker ?? '') !== (next.speaker ?? ''),
      })
    }
  }
  const last = words.at(-1)
  if (last) {
    breaks.push({ at: last.end, gap: Infinity, afterWord: words.length - 1, sentenceEnd: true, speakerChange: false })
  }
  return breaks
}

/**
 * The nearest break at or before (or at or after) a time, within `maxDistance` seconds.
 * Prefers sentence ends when two breaks are close.
 */
export function snapToBreak(
  time: number,
  breaks: Break[],
  direction: 'before' | 'after',
  maxDistance = 45,
): Break | undefined {
  const candidates = breaks.filter((b) =>
    direction === 'before' ? b.at <= time && time - b.at <= maxDistance : b.at >= time && b.at - time <= maxDistance,
  )
  if (candidates.length === 0) return undefined
  const dist = (b: Break) => Math.abs(b.at - time)
  const byDistance = [...candidates].sort((a, b) => dist(a) - dist(b))
  const nearest = byDistance[0]!
  // A sentence end a few seconds further away beats a mid-sentence pause; a distant one doesn't.
  if (nearest.sentenceEnd) return nearest
  return byDistance.find((b) => b.sentenceEnd && dist(b) - dist(nearest) <= SENTENCE_END_PREFERENCE_SEC) ?? nearest
}

/** How much further the guide will wait to land on a sentence end rather than a mid-sentence pause. */
export const SENTENCE_END_PREFERENCE_SEC = 5
