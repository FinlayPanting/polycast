import type { GuideMoment, Segment } from './types'

/** One step of a guide moment as the player performs it. */
export type PlayStep =
  | { kind: 'speech'; url: string; durationSec: number }
  | { kind: 'clip'; start: number; end: number }

/** The guide speech and host clips of a moment, in order. */
export function playSteps(m: GuideMoment): PlayStep[] {
  if (!m.audio) return []
  const steps: PlayStep[] = []
  for (const p of m.audio.parts) {
    if (p.kind === 'speech') steps.push({ kind: 'speech', url: p.url, durationSec: p.durationSec })
    else {
      const clip = m.clips[p.clipIndex]
      if (clip) steps.push({ kind: 'clip', start: clip.start, end: clip.end })
    }
  }
  return steps
}

/**
 * Decides which guide moments are due as the episode plays. The player reports the position on each
 * tick; moments whose time has been reached play once, in order, even if ticks arrive late (iOS slows
 * timers in the background). Seeks are reported explicitly: seeking forward passes over the moments in
 * between silently, seeking back makes later moments due again.
 */
/** Rewinding further than this plays the guide's moments in between again. */
export const REHEAR_AFTER_REWIND_SEC = 60

export class GuideTimeline {
  private readonly moments: GuideMoment[]
  private readonly done = new Set<string>()
  /** Moments the learner actually heard (not just passed by seeking forward). */
  private readonly heard = new Set<string>()
  private position = 0

  constructor(moments: GuideMoment[]) {
    this.moments = [...moments].sort((a, b) => a.at - b.at)
  }

  /** Moments due at this position, oldest first. The caller plays them, then calls `markPlayed`. */
  tick(position: number): GuideMoment[] {
    this.position = Math.max(this.position, position)
    return this.moments.filter((m) => m.at <= position && !this.done.has(m.id))
  }

  /**
   * The learner moved the playhead. Going back a little (replaying a line, 15 seconds back) keeps the
   * moments they've just heard; going back further hears them again.
   */
  seek(to: number): void {
    if (to < this.position) {
      const far = this.position - to > REHEAR_AFTER_REWIND_SEC
      for (const m of this.moments) {
        if (m.at <= to) continue
        // Skipped ones come back; ones just heard come back only after a long rewind.
        if (far || !this.heard.has(m.id)) {
          this.done.delete(m.id)
          this.heard.delete(m.id)
        }
      }
    } else {
      for (const m of this.moments) if (m.at < to) this.done.add(m.id)
    }
    this.position = to
  }

  markPlayed(id: string): void {
    this.done.add(id)
    this.heard.add(id)
  }

  /** The next moment after a position, for the "next in 1:37" hint and markers on the scrubber. */
  next(position: number): GuideMoment | undefined {
    return this.moments.find((m) => m.at > position && !this.done.has(m.id))
  }

  get all(): readonly GuideMoment[] {
    return this.moments
  }
}

/** Index of the subtitle line at a position, or the last line started before it. -1 before the first. */
export function segmentAt(segments: Segment[], position: number): number {
  let lo = 0
  let hi = segments.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid]!.start <= position) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/** Start of the line before the current one, for "replay the last line". */
export function replayLineStart(segments: Segment[], position: number): number {
  const i = segmentAt(segments, position)
  if (i < 0) return 0
  const current = segments[i]!
  // Just after a line starts, "replay" means the previous line.
  if (position - current.start < 1.5 && i > 0) return segments[i - 1]!.start
  return current.start
}
