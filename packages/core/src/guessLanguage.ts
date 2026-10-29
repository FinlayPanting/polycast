/**
 * Guess the language while the guide prepares (PC-1028-06): a three-second stretch of a real host,
 * from a ready episode in one of the launch languages; the learner taps the flag they think it is,
 * and the guide answers in one fixed line. Nothing keeps score and nothing is generated: the clip is
 * a stretch of an existing transcript, and the audio streams from the publisher's feed.
 */
import type { Clip, Word } from './types'

export const GUESS_CLIP_SEC = 3
/** A pause longer than this breaks a run of speech: the clip should be the host talking throughout. */
const MAX_GAP_SEC = 0.6
/** Skip the opening (jingles, sponsor reads, the show's name said in English). */
const SKIP_FRACTION = 0.2

/**
 * Three seconds of continuous speech from the transcript, starting at a word: the first such run after the
 * opening fifth, else the first anywhere. Undefined when the host never talks for three seconds straight.
 */
export function guessClip(words: Word[], clipSec = GUESS_CLIP_SEC): Clip | undefined {
  const timed = words.filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start)
  if (!timed.length) return undefined
  const span = timed[timed.length - 1]!.end - timed[0]!.start
  const from = timed[0]!.start + span * SKIP_FRACTION
  const runFrom = (i: number): Clip | undefined => {
    const start = timed[i]!.start
    for (let j = i; j < timed.length; j++) {
      if (j > i && timed[j]!.start - timed[j - 1]!.end > MAX_GAP_SEC) return undefined
      if (timed[j]!.end - start >= clipSec) return { start: round(start), end: round(start + clipSec) }
    }
    return undefined
  }
  for (const later of [true, false])
    for (let i = 0; i < timed.length; i++) {
      if (later && timed[i]!.start < from) continue
      const c = runFrom(i)
      if (c) return c
    }
  return undefined
}

const round = (n: number) => Math.round(n * 100) / 100

/** What gives each launch language away, said by the guide after a guess. */
export const GUESS_TELLS: Record<string, { name: string; tell: string }> = {
  sv: { name: 'Swedish', tell: 'The sing-song gave it away.' },
  es: { name: 'Spanish', tell: 'Those quick, clear vowels gave it away.' },
  fr: { name: 'French', tell: 'The soft, gliding word endings gave it away.' },
  de: { name: 'German', tell: 'The crisp consonants gave it away.' },
  it: { name: 'Italian', tell: 'The way every word ends on a vowel gave it away.' },
  pt: { name: 'Portuguese', tell: 'Those soft "sh" sounds gave it away.' },
}

/** The guide's one line after a guess: the same tell whether the guess was right or not. */
export function guessReply(guideName: string, answer: string, guess: string): string {
  const t = GUESS_TELLS[answer]
  if (!t) return `${guideName}: That one’s a mystery even to me.`
  return guess === answer ? `${guideName}: ${t.name}! ${t.tell}` : `${guideName}: That one was ${t.name}. ${t.tell}`
}

export interface GuessClip extends Clip {
  language: string
  audioUrl: string
}

/** The next clip to play: a random one, never the language just heard (when there's a choice). */
export function nextGuess<T extends { language: string }>(clips: T[], previous?: string, random: () => number = Math.random): T | undefined {
  const pool = clips.length > 1 ? clips.filter((c) => c.language !== previous) : clips
  if (!pool.length) return undefined
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}
