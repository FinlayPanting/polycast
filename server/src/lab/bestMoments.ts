import type { GuideMoment, Segment, Transcript } from '@polycast/core'

/**
 * The Lab picks the best moments for a video (PC-1030-10): each stored moment is scored for how well it would
 * work as a short clip for a post or a pitch, and the top three are listed first in the Moments tab. Choosing
 * the moment is the slow part; this makes it one tap. Pure and free: it reads only the transcript and the plan.
 *
 * - A clear host line just before: a line ending within three seconds of the moment, 4 to 16 words, 1.5 to 8
 *   seconds long, one speaker. That's what the video's subtitles show before Mia steps in.
 * - A laugh or a punchline nearby: written laughter ("haha", "jaja", "mdr", "kkk"…) within ten seconds, or the
 *   host's line before or after ending in "!". Scribe drops audio events like "(laughter)", so only what was
 *   said counts.
 * - Mia under 12 seconds: a short guide line keeps the clip moving; over 20 seconds counts against it.
 * Only voiced moments can be made into a video (it uses the stored lines), and the warm-up and wrap-up aren't
 * moments in the show, so those are never picked.
 */

export const BEST_MOMENTS = 3
export const SCORE = { hostLine: 2, laugh: 2, punchline: 1, shortGuide: 2, longGuide: -1 } as const

const LAUGH = /^(?:[hjk]a(?:[hjk]a)+h?|a?ha(?:ha)+|hi(?:hi)+|he(?:he)+|ah(?:ah)+|mdr+|lol+|k{3,}|rs(?:rs)+|xd+)$/i

export interface MomentScore {
  score: number
  /** Plain-English reasons, shown under the moment in the Lab. */
  reasons: string[]
}

function lineBefore(segments: Segment[], at: number): Segment | undefined {
  let best: Segment | undefined
  for (const s of segments) {
    if (s.end <= at + 0.25) best = s
    else break
  }
  return best && at - best.end <= 3 ? best : undefined
}

function lineAfter(segments: Segment[], at: number): Segment | undefined {
  const s = segments.find((x) => x.start >= at - 0.25)
  return s && s.start - at <= 3 ? s : undefined
}

export function scoreMoment(m: GuideMoment, transcript: Pick<Transcript, 'segments' | 'words'>): MomentScore | undefined {
  if (m.kind === 'warmup' || m.kind === 'wrapUp' || !m.audio?.parts.length) return undefined
  const reasons: string[] = []
  let score = 0
  const before = lineBefore(transcript.segments, m.at)
  if (before) {
    const words = transcript.words.slice(before.wordStart, before.wordEnd)
    const speakers = new Set(words.map((w) => w.speaker).filter(Boolean))
    const len = before.end - before.start
    if (words.length >= 4 && words.length <= 16 && len >= 1.5 && len <= 8 && speakers.size <= 1) {
      score += SCORE.hostLine
      reasons.push('clear host line just before')
    }
  }
  const nearLaugh = transcript.words.some((w) => Math.abs(w.start - m.at) <= 10 && LAUGH.test(w.text.replace(/[^\p{L}]+/gu, '')))
  if (nearLaugh) {
    score += SCORE.laugh
    reasons.push('a laugh nearby')
  } else if ([before, lineAfter(transcript.segments, m.at)].some((s) => s && /!\s*["»”]?$/.test(s.text.trim()))) {
    score += SCORE.punchline
    reasons.push('a punchline nearby')
  }
  const guideSec = m.audio.durationSec
  if (guideSec < 12) {
    score += SCORE.shortGuide
    reasons.push(`short guide line (${Math.round(guideSec)} s)`)
  } else if (guideSec > 20) {
    score += SCORE.longGuide
    reasons.push(`long guide line (${Math.round(guideSec)} s)`)
  }
  return { score, reasons }
}

/** The ids of the best few moments for a video, best first; ties go to the earlier moment. */
export function bestMoments(moments: GuideMoment[], transcript: Pick<Transcript, 'segments' | 'words'>, n = BEST_MOMENTS): { id: string; score: number; reasons: string[] }[] {
  return moments
    .map((m) => ({ m, s: scoreMoment(m, transcript) }))
    .filter((x): x is { m: GuideMoment; s: MomentScore } => Boolean(x.s && x.s.score > 0))
    .sort((a, b) => b.s.score - a.s.score || a.m.at - b.m.at)
    .slice(0, n)
    .map(({ m, s }) => ({ id: m.id, score: s.score, reasons: s.reasons }))
}
