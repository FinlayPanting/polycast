import type { Segment } from '@polycast/core'

/**
 * Line by line (PC-1018-07): the episode pauses at the end of each subtitle line, the line stays on
 * screen, and play (a tap or a headphone press) plays the next. Pure rules, so they can be tested.
 */

/**
 * The fallback check: if the end-of-line timer didn't get to stop playback (it was never armed,
 * say after a seek into the last moment of a line), pause once playback is seen past the end.
 */
export const LINE_END_EARLY_SEC = 0
/**
 * Arm a timer for the exact end of the line once it is this close, in seconds of real time.
 * Progress arrives every quarter of a second, so at least one update lands inside this window.
 */
export const ARM_AHEAD_SEC = 0.6
/** A jump bigger than this is a seek, not playback crossing a line's end. */
const MAX_PLAYED_STEP_SEC = 1.5
/** Lines shorter than this ("Ja.") don't get a pause of their own. */
const MIN_LINE_SEC = 0.6

/**
 * The line whose end playback has just crossed between two progress updates, if any, and where
 * the next line starts. Undefined after a seek or when nothing ended.
 */
export function lineJustEnded(segments: readonly Segment[], prev: number, now: number): { line: Segment; nextStart: number } | undefined {
  if (!(now > prev) || now - prev > MAX_PLAYED_STEP_SEC) return undefined
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!
    if (s.end - s.start < MIN_LINE_SEC) continue
    const at = s.end - LINE_END_EARLY_SEC
    if (prev < at && now >= at) {
      const next = segments[i + 1]
      return { line: s, nextStart: next ? Math.max(next.start, s.end - 0.05) : s.end }
    }
  }
  return undefined
}

/**
 * The line about to end (PC-1020-03): the one playing at `position`, worth a pause, whose end is
 * within ARM_AHEAD_SEC of real time at this playback `rate`. Gives how long to wait, in ms of real
 * time, and where the next line starts. A timer then pauses at the line's exact end, instead of
 * whichever progress update comes after it (up to a quarter of a second late, more when sped up).
 */
export function lineEndingSoon(segments: readonly Segment[], position: number, rate = 1): { line: Segment; nextStart: number; inMs: number } | undefined {
  const r = rate > 0 ? rate : 1
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!
    if (s.start > position) break
    if (position >= s.end || s.end - s.start < MIN_LINE_SEC) continue
    const left = (s.end - position) / r
    if (left > ARM_AHEAD_SEC) return undefined
    const next = segments[i + 1]
    return { line: s, nextStart: next ? Math.max(next.start, s.end - 0.05) : s.end, inMs: Math.max(0, Math.round(left * 1000)) }
  }
  return undefined
}
