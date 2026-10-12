import type { Word } from '../src'

/** Builds timed words from a sentence string: each word 0.3s long, 0.05s apart, `pauseAfter` adds pauses. */
export function wordsFrom(text: string, startAt = 0, pauseAfter: Record<number, number> = {}, speaker = 'A'): Word[] {
  let t = startAt
  return text.split(/\s+/).map((w, i) => {
    const word: Word = { text: w, start: t, end: t + 0.3, speaker }
    t += 0.35 + (pauseAfter[i] ?? 0)
    return word
  })
}
