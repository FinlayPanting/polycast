import { selectMoments, withoutLanguageMarks, type Clip, type GlossEntry, type GuidanceLevel, type GuideMoment, type LessonPlan, type PrimerWord } from '@polycast/core'

/**
 * Two panes on the open iPhone Duo (PC-1026-03). When the window is this wide (the open inner display, either
 * way round), the player puts the subtitles on one side and the guide's notes, primer words and saved words on
 * the other. Every phone, and the Duo folded, stays one pane.
 */
export const TWO_PANE_MIN_WIDTH = 700
/** Below this height a wide window is a phone on its side, not the open Duo; it stays one pane. */
export const TWO_PANE_MIN_HEIGHT = 500

export function isTwoPane(width: number, height: number): boolean {
  return width >= TWO_PANE_MIN_WIDTH && height >= TWO_PANE_MIN_HEIGHT
}

export type PaneNote = { id: string; kind: GuideMoment['kind']; at: number; term?: { text: string; meaning: string }; text: string }

/** What the guide said, as plain text: the host's clips written out in quotes, [[ ]] marks dropped. */
export function noteText(m: GuideMoment, clipText: (c: Clip) => string): string {
  const withClips = m.script.replace(/\{clip:(\d+)\}/g, (_, n: string) => {
    const clip = m.clips[Number(n)]
    return clip ? `“${clipText(clip)}”` : ''
  })
  return withoutLanguageMarks(withClips).replace(/\s+/g, ' ').trim()
}

/**
 * The guide's notes so far: the moments this listen plays (same level as the scrubber's markers) that have
 * already come up, newest first. Nothing ahead of the learner is shown, so nothing is spoilt. Quick questions
 * are left out (their answer is the point); the wrap-up is the finish screen's.
 */
export function notesSoFar(plan: LessonPlan | undefined, level: GuidanceLevel, position: number, clipText: (c: Clip) => string): PaneNote[] {
  const all = paneNotes(plan, level, clipText)
  return notesUpTo(all, passedCount(all, position))
}

/**
 * Every note this listen can show, oldest first, worked out once per plan and level (PC-1027-10): the pane
 * then only counts how many have passed on each tick, instead of re-sorting and rewriting them all.
 */
export function paneNotes(plan: LessonPlan | undefined, level: GuidanceLevel, clipText: (c: Clip) => string): PaneNote[] {
  if (!plan) return []
  return selectMoments(plan.moments, level)
    .filter((m) => m.kind !== 'quickQuestion' && m.kind !== 'wrapUp')
    .map((m) => ({ id: m.id, kind: m.kind, at: m.at, ...(m.term ? { term: { text: m.term.text, meaning: m.term.meaning } } : {}), text: noteText(m, clipText) }))
    .filter((n) => n.text.length > 0)
    .sort((a, b) => a.at - b.at)
}

/** How many of `items` (sorted by `at`) have come up by `position`: a binary search, cheap on every tick. */
export function passedCount(items: readonly { at: number }[], position: number): number {
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (items[mid]!.at <= position) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The first `count` notes, newest first, as the pane shows them. */
export function notesUpTo(all: readonly PaneNote[], count: number): PaneNote[] {
  return all.slice(0, count).reverse()
}

/**
 * The host's words inside a clip, found by binary search on the transcript's word times (PC-1027-10)
 * rather than scanning all ~9,000 words of an hour-long episode for each clip.
 */
export function clipTextFrom(words: readonly { start: number; end: number; text: string }[]): (c: Clip) => string {
  return (c) => {
    const from = c.start - 0.05
    const to = c.end + 0.05
    let lo = 0
    let hi = words.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (words[mid]!.start < from) lo = mid + 1
      else hi = mid
    }
    const out: string[] = []
    for (let i = lo; i < words.length && words[i]!.start <= to; i++) if (words[i]!.end <= to) out.push(words[i]!.text)
    return out.join(' ')
  }
}

/** The primer's words to listen for, with whether the host has said each one yet. */
export function primerWordsSoFar(plan: LessonPlan | undefined, position: number): (PrimerWord & { heard: boolean })[] {
  return (plan?.primer?.words ?? []).map((w) => ({ ...w, heard: w.at <= position }))
}

/** How many primer words have been heard by `position`: the key the pane rebuilds its word list on. */
export function heardCount(plan: LessonPlan | undefined, position: number): number {
  let n = 0
  for (const w of plan?.primer?.words ?? []) if (w.at <= position) n++
  return n
}

/** Words saved during this listen, newest first, with their meaning from the episode's glossary when it has one. */
export function savedWithMeanings(saved: string[], glossary: Record<string, GlossEntry> | undefined): { lemma: string; meaning?: string }[] {
  const meanings = new Map<string, string>()
  for (const g of Object.values(glossary ?? {})) if (g.meaning && !meanings.has(g.lemma)) meanings.set(g.lemma, g.meaning)
  return [...new Set(saved)].reverse().map((lemma) => ({ lemma, ...(meanings.has(lemma) ? { meaning: meanings.get(lemma) } : {}) }))
}
