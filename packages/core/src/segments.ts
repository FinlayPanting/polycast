import { endsSentence } from './text'
import type { Segment, Word } from './types'

export interface SegmentOptions {
  /** Split long sentences so a subtitle line stays readable. */
  maxWords?: number
  maxSeconds?: number
}

/**
 * Groups timed words into subtitle lines: one sentence per line, split at a speaker change,
 * and broken up when a sentence runs too long to read at a glance.
 */
export function buildSegments(words: Word[], opts: SegmentOptions = {}): Segment[] {
  const maxWords = opts.maxWords ?? 16
  const maxSeconds = opts.maxSeconds ?? 7
  const segments: Segment[] = []
  let start = 0
  const close = (end: number) => {
    if (end <= start) return
    const slice = words.slice(start, end)
    segments.push({
      id: `s${segments.length + 1}`,
      start: slice[0]!.start,
      end: slice.at(-1)!.end,
      speaker: slice[0]!.speaker,
      text: slice.map((w) => w.text).join(' '),
      wordStart: start,
      wordEnd: end,
    })
    start = end
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    const next = words[i + 1]
    const count = i - start + 1
    const span = w.end - words[start]!.start
    const speakerChange = next !== undefined && (next.speaker ?? '') !== (w.speaker ?? '')
    if (!next || endsSentence(w.text) || speakerChange || count >= maxWords || span >= maxSeconds) close(i + 1)
  }
  return segments
}

/**
 * Podcasting 2.0 JSON transcripts. Usable for host clips only when timed word by word, so this
 * returns undefined for sentence-level files and the episode is transcribed instead.
 */
export function wordsFromPodcastJson(json: any, maxAvgSegmentSec = 1.2): Word[] | undefined {
  const segs: any[] = json?.segments ?? []
  if (segs.length === 0) return undefined
  const words: Word[] = []
  for (const s of segs) {
    const start = Number(s.startTime)
    const end = Number(s.endTime)
    const body = String(s.body ?? '').trim()
    if (!body || !Number.isFinite(start) || !Number.isFinite(end)) continue
    if (body.split(/\s+/).length > 1) return undefined
    words.push({ text: body, start, end, speaker: s.speaker })
  }
  if (words.length === 0) return undefined
  const avg = words.reduce((sum, w) => sum + (w.end - w.start), 0) / words.length
  return avg <= maxAvgSegmentSec ? words : undefined
}
