/**
 * Jump from the episode map, then hop back (PC-1018-10). After a jump, the place the learner was
 * at is offered for a short while ("Back to where you were, 32:10"), so peeking at a theme doesn't
 * lose it. Only worth offering for a real place, and only if the jump moved somewhere else.
 */
export const HOP_BACK_MS = 15_000
/** Closer than this, the jump didn't really move the learner. */
export const HOP_BACK_MIN_GAP_SEC = 20
/** Before this, there was no place worth going back to (a fresh start). */
export const HOP_BACK_MIN_PLACE_SEC = 10

export interface HopBack {
  /** Where the learner was before the jump, in seconds. */
  to: number
  /** When the offer goes away (ms since epoch). */
  until: number
}

export function hopBackOffer(previous: number | undefined, jumpTo: number, nowMs: number): HopBack | undefined {
  if (previous === undefined || !Number.isFinite(previous) || previous < HOP_BACK_MIN_PLACE_SEC) return undefined
  if (Math.abs(previous - jumpTo) < HOP_BACK_MIN_GAP_SEC) return undefined
  return { to: previous, until: nowMs + HOP_BACK_MS }
}

/** Whether the offer is still showing. */
export function hopBackLive(h: HopBack | undefined, nowMs: number): h is HopBack {
  return Boolean(h && nowMs < h.until)
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

export function hopBackLabel(h: HopBack): string {
  return `Back to where you were, ${clock(h.to)}`
}
