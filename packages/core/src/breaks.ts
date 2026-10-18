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
  /** The word before the pause ends a question. */
  question: boolean
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
        question: /\?["”»)]*$/u.test(w.text),
      })
    }
  }
  const last = words.at(-1)
  if (last) {
    breaks.push({ at: last.end, gap: Infinity, afterWord: words.length - 1, sentenceEnd: true, speakerChange: false, question: false })
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

/** A sentence end followed by at least this much silence counts as a speaker finishing their bit. */
export const FINISHED_PAUSE_SEC = 1.0

/**
 * How natural a pause is for the guide to step in (PC-1017-F14), best first:
 * 3: someone has finished their answer (the speaker changes at a sentence end), just asked a
 *    question, or the episode has ended;
 * 2: a sentence end with a real pause after it, where a speaker has finished their bit;
 * 1: any other sentence end;
 * 0: mid-sentence, never used for the guide.
 */
export function pauseQuality(b: Break): 0 | 1 | 2 | 3 {
  if (!b.sentenceEnd) return 0
  if (b.speakerChange || b.question || b.gap === Infinity) return 3
  if (b.gap >= FINISHED_PAUSE_SEC) return 2
  return 1
}

/**
 * The best natural pause at or before (or at or after) a time, within `maxDistance` seconds: the
 * nearest of the best quality available, so a finished answer a bit further away beats a sentence end
 * right there. Never a mid-sentence pause. The pause always wins over exact timing.
 */
export function snapToNaturalPause(
  time: number,
  breaks: Break[],
  direction: 'before' | 'after',
  maxDistance = 45,
): Break | undefined {
  const candidates = breaks.filter(
    (b) =>
      pauseQuality(b) > 0 &&
      (direction === 'before' ? b.at <= time && time - b.at <= maxDistance : b.at >= time && b.at - time <= maxDistance),
  )
  if (candidates.length === 0) return undefined
  const best = Math.max(...candidates.map(pauseQuality))
  return candidates
    .filter((b) => pauseQuality(b) === best)
    .reduce((a, b) => (Math.abs(b.at - time) < Math.abs(a.at - time) ? b : a))
}
