import type { Segment } from '@polycast/core'

/**
 * Line by line (PC-1018-07): the episode pauses at the end of each subtitle line, the line stays on
 * screen, and play (a tap or a headphone press) plays the next. Pure rules, so they can be tested.
 */

/** Pause this much before a line's end: progress arrives about four times a second. */
export const LINE_END_EARLY_SEC = 0.12
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
