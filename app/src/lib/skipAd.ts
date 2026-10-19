import { advertAt } from '@polycast/core'

type Break = { start: number; end: number }

/** Breaks closer together than this are one stretch of adverts to the listener. */
const JOIN_GAP_SEC = 1.5

/**
 * The Skip ad pill (PC-1017-F05): during an advert, where one tap lands, the moment the episode
 * resumes. Back-to-back adverts count as one break, so one tap clears them all. Undefined outside
 * an advert, or in its last second (nothing left worth skipping).
 */
export function skipAdTarget(adverts: Break[] | undefined, position: number): { resumeAt: number; remainingSec: number } | undefined {
  const current = advertAt(adverts, position)
  if (!current || !adverts) return undefined
  const sorted = [...adverts].sort((a, b) => a.start - b.start)
  let end = current.end
  for (const a of sorted) if (a.start > current.start && a.start - end <= JOIN_GAP_SEC) end = Math.max(end, a.end)
  const remainingSec = end - position
  if (remainingSec < 1) return undefined
  return { resumeAt: end, remainingSec }
}
