import { normalizeToken, tokenize } from './text'
import type { Clip, Word } from './types'

/** A saved word in the learner's word bank, with the host's clip it came from. */
export interface SavedWord {
  lemma: string
  /** Forms heard so far, normalised, used to recognise the word in other episodes. */
  forms: string[]
  meaning: string
  language: string
  source: { episodeId: string; clip: Clip; sentence: string }
  review: ReviewState
}

export interface ReviewState {
  /** 0 = new; each successful review moves up one step. */
  step: number
  /** ISO date the word is next due. */
  due: string
  lastReviewed?: string
}

/** Days until the next review at each step: growing gaps, which the research says give the best long-term memory. */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 16, 35, 80, 180] as const

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

export function newReview(now: string): ReviewState {
  return { step: 0, due: addDays(now, REVIEW_INTERVALS_DAYS[0]) }
}

/** After a review: "got it" moves to the next, longer gap; "again" starts over at one day. */
export function nextReview(state: ReviewState, result: 'gotIt' | 'again', now: string): ReviewState {
  if (result === 'again') return { step: 0, due: addDays(now, REVIEW_INTERVALS_DAYS[0]), lastReviewed: now }
  const step = Math.min(state.step + 1, REVIEW_INTERVALS_DAYS.length - 1)
  return { step, due: addDays(now, REVIEW_INTERVALS_DAYS[step]!), lastReviewed: now }
}

export function isDue(state: ReviewState, now: string): boolean {
  return state.due <= now
}

/** A word is counted as known once reviewed successfully at least twice. Known words aren't spotlighted again. */
export function isKnown(state: ReviewState): boolean {
  return state.step >= 2
}

export interface OldFriend {
  wordIndex: number
  lemma: string
}

/**
 * Old friends: words from earlier episodes turning up again. Returns each transcript word that
 * matches a saved word from a different episode, so the player can chime and glow it.
 */
export function findOldFriends(words: Word[], saved: SavedWord[], episodeId: string, language?: string): OldFriend[] {
  const byForm = new Map<string, string>()
  for (const s of saved) {
    if (s.source.episodeId === episodeId) continue
    for (const f of [s.lemma, ...s.forms]) {
      const toks = tokenize(f, language)
      if (toks.length === 1) byForm.set(toks[0]!, s.lemma)
    }
  }
  const found: OldFriend[] = []
  const seen = new Set<string>()
  words.forEach((w, i) => {
    const lemma = byForm.get(normalizeToken(w.text, language))
    // Only the first time each word appears, so the chime stays a treat rather than noise.
    if (lemma && !seen.has(lemma)) {
      seen.add(lemma)
      found.push({ wordIndex: i, lemma })
    }
  })
  return found
}
