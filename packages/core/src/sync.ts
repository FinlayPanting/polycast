/**
 * Keeping the lesson in time with each listener's own copy of an episode.
 *
 * Many podcast hosts stitch adverts into the audio at the moment it's downloaded, chosen by where
 * the listener is. The copy we transcribed and the copy a learner plays can then differ: adverts
 * of other lengths, in other places, or missing. Both copies get a small fingerprint (the loudness
 * of each 50 ms of audio). Matching the two finds the stretches of shared content and how far each
 * is shifted, so every time in the lesson can be moved onto the learner's copy, and anything that
 * only exists in our copy (our adverts) can be left out.
 */
import type { Clip, GuideMoment, LessonPlan, Primer, Segment, Transcript, Word } from './types'

/** Fingerprints are made from mono 16-bit audio at this rate. */
export const FINGERPRINT_SAMPLE_RATE = 8000
/** Samples per fingerprint frame: 50 ms. */
export const FINGERPRINT_HOP = 400
export const FINGERPRINT_FPS = FINGERPRINT_SAMPLE_RATE / FINGERPRINT_HOP
/** log10 of a frame's mean square, times this, rounded and clamped to a byte. */
const SCALE = 25

/** Fingerprint value for one frame's samples. Server (ffmpeg) and phone (AVFoundation) both use this. */
export function frameValue(samples: ArrayLike<number>, from = 0, to = samples.length): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += samples[i]! * samples[i]!
  const v = Math.round(Math.log10(sum / Math.max(1, to - from) + 1) * SCALE)
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** Builds a fingerprint from audio that arrives in chunks (the server decodes as it streams). */
export class FingerprintBuilder {
  private readonly frames: number[] = []
  private carry: number[] = []

  push(samples: Int16Array): void {
    let i = 0
    if (this.carry.length) {
      const need = FINGERPRINT_HOP - this.carry.length
      const take = Math.min(need, samples.length)
      for (let k = 0; k < take; k++) this.carry.push(samples[k]!)
      i = take
      if (this.carry.length < FINGERPRINT_HOP) return
      this.frames.push(frameValue(this.carry))
      this.carry = []
    }
    for (; i + FINGERPRINT_HOP <= samples.length; i += FINGERPRINT_HOP) this.frames.push(frameValue(samples, i, i + FINGERPRINT_HOP))
    for (; i < samples.length; i++) this.carry.push(samples[i]!)
  }

  /** The fingerprint; a final part-frame is dropped. */
  finish(): Uint8Array {
    return Uint8Array.from(this.frames)
  }
}

export function fingerprintFromPcm(samples: Int16Array): Uint8Array {
  const b = new FingerprintBuilder()
  b.push(samples)
  return b.finish()
}

/** A stretch of our copy that is also in the listener's copy, `offset` seconds later there. */
export interface SyncSegment {
  refStart: number
  refEnd: number
  offset: number
}

export interface SyncMap {
  segments: SyncSegment[]
  /** Share of our copy found in the listener's copy, 0 to 1. Low means the sync didn't work. */
  coverage: number
  /** Length of the listener's copy, in seconds. */
  listenerDuration: number
}

/** Loudness with slow changes removed, so the rhythm of speech is what gets matched. */
function shape(fp: Uint8Array): Float32Array {
  const n = fp.length
  const k = 2 * FINGERPRINT_FPS + 1
  const half = k >> 1
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + fp[i]!
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(n, i + half + 1)
    out[i] = fp[i]! - (prefix[b]! - prefix[a]!) / (b - a)
  }
  return out
}

/** Normalised cross-correlation of R[r0, r0+w) with L[l0, l0+w), or -1 if out of range. */
function ncc(R: Float32Array, L: Float32Array, r0: number, l0: number, w: number): number {
  if (l0 < 0 || l0 + w > L.length || r0 < 0 || r0 + w > R.length) return -1
  let sa = 0, sb = 0
  for (let i = 0; i < w; i++) {
    sa += R[r0 + i]!
    sb += L[l0 + i]!
  }
  const ma = sa / w, mb = sb / w
  let num = 0, da = 0, db = 0
  for (let i = 0; i < w; i++) {
    const a = R[r0 + i]! - ma
    const b = L[l0 + i]! - mb
    num += a * b
    da += a * a
    db += b * b
  }
  const d = Math.sqrt(da * db)
  return d > 0 ? num / d : -1
}

function decimate(x: Float32Array, f: number): Float32Array {
  const out = new Float32Array(Math.floor(x.length / f))
  for (let i = 0; i < out.length; i++) {
    let s = 0
    for (let k = 0; k < f; k++) s += x[i * f + k]!
    out[i] = s / f
  }
  return out
}

/** Searches the whole listener copy for a window of ours: coarse pass first, then refined. */
function globalSearch(R: Float32Array, L: Float32Array, Rc: Float32Array, Lc: Float32Array, r0: number, w: number, f: number) {
  const wc = Math.floor(w / f)
  const rc = Math.floor(r0 / f)
  const top: { at: number; score: number }[] = []
  for (let l = 0; l + wc <= Lc.length; l++) {
    const s = ncc(Rc, Lc, rc, l, wc)
    if (top.length < 5 || s > top[top.length - 1]!.score) {
      top.push({ at: l, score: s })
      top.sort((a, b) => b.score - a.score)
      if (top.length > 5) top.pop()
    }
  }
  let best = { offset: 0, score: -1 }
  for (const c of top) {
    for (let d = -2 * f; d <= 2 * f; d++) {
      const l0 = c.at * f + d
      const s = ncc(R, L, r0, l0, w)
      if (s > best.score) best = { offset: l0 - r0, score: s }
    }
  }
  return best
}

export interface AlignOptions {
  /** Seconds between anchors. */
  stepSec?: number
  /** Seconds of audio compared at each anchor. */
  windowSec?: number
  /** A match must score at least this (normalised cross-correlation). */
  minScore?: number
}

/**
 * Finds where each stretch of our copy (`reference`) sits in the listener's copy. Anchors every few
 * seconds are matched near the previous shift first (cheap), and searched for across the whole copy
 * when that fails (after an advert). Runs of anchors that agree become segments; lone matches are
 * treated as noise; segment edges are then refined to within a frame or two.
 */
export function alignFingerprints(reference: Uint8Array, listener: Uint8Array, opts: AlignOptions = {}): SyncMap {
  const fps = FINGERPRINT_FPS
  const w = Math.round((opts.windowSec ?? 10) * fps)
  const step = Math.round((opts.stepSec ?? 5) * fps)
  const ok = opts.minScore ?? 0.75
  const local = 2 * fps
  const f = 4
  const R = shape(reference)
  const L = shape(listener)
  const Rc = decimate(R, f)
  const Lc = decimate(L, f)

  const anchors: { r: number; offset: number }[] = []
  let offset: number | undefined
  // After a whole-copy search finds nothing we're probably inside an advert of ours: adverts last at
  // least 15 s, so skip the expensive search for the next two anchors.
  let skipGlobal = 0
  for (let r0 = 0; r0 + w <= R.length; r0 += step) {
    let best = { offset: 0, score: -1 }
    if (offset !== undefined) {
      for (let d = -local; d <= local; d++) {
        const s = ncc(R, L, r0, r0 + offset + d, w)
        if (s > best.score) best = { offset: offset + d, score: s }
      }
    }
    if (best.score < ok && skipGlobal > 0) skipGlobal--
    else if (best.score < ok) {
      const g = globalSearch(R, L, Rc, Lc, r0, w, f)
      if (g.score > best.score) best = g
      if (g.score < ok) skipGlobal = 2
    }
    if (best.score >= ok) {
      offset = best.offset
      anchors.push({ r: r0, offset: best.offset })
    }
  }

  // Group anchors that agree on the shift; a run needs 3 anchors (about 20 s) to count.
  const tol = Math.round(0.25 * fps)
  const runs: { first: number; last: number; offset: number; n: number }[] = []
  for (const a of anchors) {
    const run = runs[runs.length - 1]
    if (run && Math.abs(run.offset - a.offset) <= tol && a.r - run.last <= 2 * step) {
      run.last = a.r
      run.n++
    } else runs.push({ first: a.r, last: a.r, offset: a.offset, n: 1 })
  }
  const kept = runs.filter((r) => r.n >= 3)

  // A run's anchors place it roughly; its first and last windows may straddle an advert. Find each
  // edge precisely: the earliest (latest) frame where two consecutive short windows both match.
  const sw = 2 * fps
  // Short windows are noisier, so they get a slightly lower bar; two in a row must pass.
  const good = (t: number, off: number) => ncc(R, L, t, t + off, sw) >= ok - 0.1
  const frames: { start: number; end: number; offset: number }[] = []
  for (const run of kept) {
    let start = run.first + w
    for (let t = Math.max(0, run.first - 3 * step); t <= run.first + w; t++) {
      if (good(t, run.offset) && good(t + sw, run.offset)) {
        start = t
        break
      }
    }
    let end = run.last
    for (let t = Math.min(R.length, run.last + w + 3 * step); t >= run.last; t--) {
      if (good(t - sw, run.offset) && good(t - 2 * sw, run.offset)) {
        end = t
        break
      }
    }
    if (end > start) frames.push({ start, end, offset: run.offset })
  }
  // Neighbours must not overlap: split any overlap down the middle.
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!, b = frames[i]!
    if (a.end > b.start) a.end = b.start = Math.round((a.end + b.start) / 2)
  }

  const segments = frames.map((s) => ({ refStart: s.start / fps, refEnd: s.end / fps, offset: s.offset / fps }))
  const covered = segments.reduce((sum, s) => sum + (s.refEnd - s.refStart), 0)
  return { segments, coverage: R.length ? Math.min(1, covered / (R.length / fps)) : 0, listenerDuration: listener.length / fps }
}

/** Where a time in our copy falls in the listener's copy, or null if that moment isn't there (our advert). */
export function toListenerTime(map: SyncMap, t: number): number | null {
  let lo = 0, hi = map.segments.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const s = map.segments[mid]!
    if (t < s.refStart) hi = mid - 1
    else if (t >= s.refEnd) lo = mid + 1
    else return t + s.offset
  }
  return null
}

/** The first time at or after `t` that exists in the listener's copy, for things that must still happen. */
function nextListenerTime(map: SyncMap, t: number): number {
  const direct = toListenerTime(map, t)
  if (direct !== null) return direct
  const after = map.segments.find((s) => s.refStart > t)
  return after ? after.refStart + after.offset : map.listenerDuration
}

/** Below this share of matched audio, the sync is not trusted and the lesson keeps its own times. */
export const MIN_SYNC_COVERAGE = 0.6

/**
 * Moves a transcript and lesson plan onto the listener's copy. Words, subtitle lines and host clips
 * that only exist in our copy (our adverts) are dropped; guide moments always survive, moved to the
 * next shared moment if needed. With an untrustworthy map, everything is returned unchanged.
 */
export function retimeLesson(transcript: Transcript, plan: LessonPlan | null, map: SyncMap): { transcript: Transcript; plan: LessonPlan | null; synced: boolean } {
  if (map.coverage < MIN_SYNC_COVERAGE || !map.segments.length) return { transcript, plan, synced: false }

  const newIndex = new Array<number>(transcript.words.length).fill(-1)
  const words: Word[] = []
  transcript.words.forEach((w, i) => {
    const start = toListenerTime(map, w.start)
    if (start === null) return
    const end = toListenerTime(map, w.end) ?? start + (w.end - w.start)
    newIndex[i] = words.length
    words.push({ ...w, start, end })
  })

  const segments: Segment[] = []
  for (const s of transcript.segments) {
    let first = -1, last = -1
    for (let i = s.wordStart; i < s.wordEnd; i++) {
      if (newIndex[i]! < 0) continue
      if (first < 0) first = newIndex[i]!
      last = newIndex[i]!
    }
    if (first < 0) continue
    const start = toListenerTime(map, s.start) ?? words[first]!.start
    const end = toListenerTime(map, s.end) ?? words[last]!.end
    segments.push({ ...s, start, end, wordStart: first, wordEnd: last + 1 })
  }

  const retimedPlan = plan && { ...plan, moments: plan.moments.map((m) => retimeMoment(m, map)), ...(plan.primer ? { primer: retimePrimer(plan.primer, map) } : {}) }
  return { transcript: { ...transcript, words, segments }, plan: retimedPlan, synced: true }
}

/** Primer words and themes move with the episode; a word whose clip is only in our copy loses its clip. */
function retimePrimer(primer: Primer, map: SyncMap): Primer {
  return {
    ...primer,
    words: primer.words.map((w) => {
      const start = toListenerTime(map, w.clip.start)
      const end = toListenerTime(map, w.clip.end)
      const clip = start !== null && end !== null && end > start ? { start, end } : { start: -1, end: -1 }
      return { ...w, at: nextListenerTime(map, w.at), clip }
    }),
    themes: primer.themes.map((t) => ({ ...t, at: nextListenerTime(map, t.at) })),
  }
}

function retimeMoment(m: GuideMoment, map: SyncMap): GuideMoment {
  const at = m.kind === 'warmup' ? 0 : m.kind === 'wrapUp' ? map.listenerDuration : nextListenerTime(map, m.at)
  // Clips keep their index (the script refers to them by number); a clip we can't place is left out of the audio.
  const clips: Clip[] = m.clips.map((c) => {
    const start = toListenerTime(map, c.start)
    const end = toListenerTime(map, c.end)
    return start !== null && end !== null && end > start ? { start, end } : { start: -1, end: -1 }
  })
  const audio = m.audio && {
    ...m.audio,
    parts: m.audio.parts.filter((p) => p.kind === 'speech' || (clips[p.clipIndex]?.start ?? -1) >= 0),
  }
  if (audio) {
    audio.durationSec = audio.parts.reduce((sum, p) => {
      if (p.kind === 'speech') return sum + p.durationSec
      const c = clips[p.clipIndex]!
      return sum + (c.end - c.start)
    }, 0)
  }
  return { ...m, at, clips, audio }
}

/** Stretches shorter than this aren't called adverts (a pause, a jingle, a matching wobble). */
export const MIN_ADVERT_SEC = 15

/**
 * The stretches of the listener's copy that aren't in ours: usually the adverts their host stitched
 * in for them. In listener time, in order. Display only: nothing is skipped automatically.
 */
export function listenerOnlyStretches(map: SyncMap, minSec = MIN_ADVERT_SEC): { start: number; end: number }[] {
  if (map.coverage < MIN_SYNC_COVERAGE || !map.segments.length) return []
  const shared = map.segments.map((s) => ({ start: s.refStart + s.offset, end: s.refEnd + s.offset })).sort((a, b) => a.start - b.start)
  const out: { start: number; end: number }[] = []
  let cursor = 0
  for (const s of shared) {
    if (s.start - cursor >= minSec) out.push({ start: cursor, end: s.start })
    cursor = Math.max(cursor, s.end)
  }
  if (map.listenerDuration - cursor >= minSec) out.push({ start: cursor, end: map.listenerDuration })
  return out
}

/** The advert stretch `t` falls in, if any. */
export function advertAt(adverts: { start: number; end: number }[] | undefined, t: number): { start: number; end: number } | undefined {
  return adverts?.find((a) => t >= a.start && t < a.end)
}
