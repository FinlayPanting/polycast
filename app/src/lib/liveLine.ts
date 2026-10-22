import type { Segment } from '@polycast/core'

/**
 * The lock-screen transcript test (PC-1020-L1). A Live Activity shows the line being said, its
 * translation and the next line, with a bar under the line that iOS itself animates from the
 * line's start to its end (ProgressView(timerInterval:)). So the app sends one update per line,
 * never per word, and logs each one so a real listen can show whether iOS keeps up when locked.
 */
export interface LiveLine {
  /** Index of the line in the transcript. */
  index: number
  line: string
  english: string
  next: string
  /** When the line started and will end, as wall-clock milliseconds, at the current speed. */
  startMs: number
  endMs: number
}

/** The line being said at `sec`: the one spanning it, or between lines the one just finished. -1 before the first. */
export function lineAt(segments: Segment[], sec: number): number {
  let lo = 0
  let hi = segments.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid]!.start <= sec) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/** What the Live Activity shows for line `i`, heard at `positionSec` at wall-clock `nowMs`. */
export function liveLine(segments: Segment[], i: number, positionSec: number, nowMs: number, rate = 1): LiveLine {
  const s = segments[i]!
  const r = rate > 0 ? rate : 1
  const startMs = Math.round(nowMs - ((positionSec - s.start) * 1000) / r)
  const endMs = Math.max(startMs, Math.round(startMs + ((s.end - s.start) * 1000) / r))
  return { index: i, line: s.text, english: s.translation ?? '', next: segments[i + 1]?.text ?? '', startMs, endMs }
}

/** Sends an update only when the line changes (or the speed does, which moves the bar's end). */
export class LiveLineFeed {
  private last: { index: number; rate: number } | undefined
  sent = 0

  constructor(private send: (l: LiveLine) => void) {}

  onPosition(segments: Segment[], positionSec: number, nowMs: number, rate = 1): LiveLine | undefined {
    const i = lineAt(segments, positionSec)
    if (i < 0) return undefined
    if (this.last && this.last.index === i && this.last.rate === rate) return undefined
    this.last = { index: i, rate }
    const l = liveLine(segments, i, positionSec, nowMs, rate)
    this.sent++
    this.send(l)
    return l
  }

  reset(): void {
    this.last = undefined
  }
}
