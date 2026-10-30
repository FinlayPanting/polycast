import { talkStart } from '@polycast/core'
import type { HopBack } from './hopBack'

/** How long "Play from the very start" stays on offer after a first listen skips the opening. */
export const VERY_START_MS = 30_000
export const VERY_START_LABEL = 'Play from the very start'

/**
 * Where a listen starts when it's the learner's very first guided episode (PC-1027-03): where the host
 * starts talking, past theme music or a pre-roll advert. Only for a fresh, guided start; a jump from
 * the episode map, a resume or a subtitles-only listen start as before (undefined).
 */
export function firstTalkStart(o: {
  guided: boolean
  from: number | undefined
  resumeAt: number
  firstGuided: boolean
  segments: { start: number }[]
  adverts?: { start: number; end: number }[]
}): number | undefined {
  if (!o.guided || o.from !== undefined || o.resumeAt > 0 || !o.firstGuided) return undefined
  const at = talkStart(o.segments, o.adverts)
  return at > 0 ? at : undefined
}

/** The quiet way back to the opening, shown for a while after the skip. */
export function veryStartOffer(nowMs: number): HopBack {
  return { to: 0, until: nowMs + VERY_START_MS, label: VERY_START_LABEL }
}
