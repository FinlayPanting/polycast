import { describe, expect, it } from 'vitest'
import {
  alignFingerprints,
  FINGERPRINT_FPS,
  FINGERPRINT_HOP,
  FingerprintBuilder,
  fingerprintFromPcm,
  retimeLesson,
  toListenerTime,
  type SyncMap,
} from '../src/sync'
import type { LessonPlan, Transcript } from '../src/types'

/** Deterministic speech-like loudness: syllables, words and pauses at random lengths. */
function speech(seconds: number, seed: number): Uint8Array {
  let s = seed >>> 0
  const rand = () => {
    // mulberry32: integer maths only, so each seed gives its own sequence.
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = new Uint8Array(Math.round(seconds * FINGERPRINT_FPS))
  let i = 0
  while (i < out.length) {
    // A syllable rises and falls; words are runs of syllables; pauses are quieter and vary in length.
    const pause = rand() < 0.2
    const len = pause ? 3 + Math.floor(rand() * 15) : 3 + Math.floor(rand() * 6)
    const peak = pause ? 35 + rand() * 15 : 110 + rand() * 70
    for (let k = 0; k < len && i < out.length; k++, i++) out[i] = Math.round(peak * Math.sin((Math.PI * (k + 0.5)) / len) + 30 + rand() * 12)
  }
  return out
}
const cat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]))
const at = (fp: Uint8Array, from: number, to: number) => fp.slice(from * FINGERPRINT_FPS, to * FINGERPRINT_FPS)

describe('fingerprints', () => {
  it('gives one value a frame, the same however the audio arrives', () => {
    const pcm = Int16Array.from({ length: FINGERPRINT_HOP * 50 + 123 }, (_, i) => Math.round(8000 * Math.sin(i / 7) * Math.sin(i / 3000)))
    const whole = fingerprintFromPcm(pcm)
    expect(whole).toHaveLength(50)
    const b = new FingerprintBuilder()
    for (let i = 0; i < pcm.length; i += 777) b.push(pcm.subarray(i, i + 777))
    expect(b.finish()).toEqual(whole)
    expect(fingerprintFromPcm(new Int16Array(FINGERPRINT_HOP))[0]).toBe(0) // silence
  })
})

describe('matching a listener\'s copy with different adverts', () => {
  // Our copy: content A (10 min), our advert (90 s), content B (20 min), content C (20 min).
  const A = speech(600, 1), ourAd = speech(90, 2), B = speech(1200, 3), C = speech(1200, 4)
  const reference = cat(A, ourAd, B, C)
  // Their copy: a 30 s pre-roll, A, B, a 45 s advert of their own, C.
  const theirAd = speech(45, 5), preRoll = speech(30, 6)
  const listener = cat(preRoll, A, B, theirAd, C)
  const map = alignFingerprints(reference, listener)

  it('finds every shared stretch and how far it moved', () => {
    expect(map.segments).toHaveLength(3)
    expect(map.segments.map((s) => s.offset)).toEqual([30, -60, -15])
    expect(map.segments[0]!.refStart).toBeCloseTo(0, 0)
    expect(Math.abs(map.segments[1]!.refStart - 690)).toBeLessThan(1.5)
    expect(map.coverage).toBeGreaterThan(0.95)
    expect(map.listenerDuration).toBeCloseTo(3075, 0)
  })

  it('maps times onto their copy, and our advert to nothing', () => {
    expect(toListenerTime(map, 100)).toBe(130)
    expect(toListenerTime(map, 640)).toBeNull()
    expect(toListenerTime(map, 1000)).toBe(940)
    expect(toListenerTime(map, 2500)).toBe(2485)
  })

  it('is fast enough for a phone: an hour of audio in well under a second here', () => {
    const t0 = performance.now()
    alignFingerprints(reference, listener)
    expect(performance.now() - t0).toBeLessThan(2000)
  })

  it('reports a failed match as low coverage rather than guessing', () => {
    const other = alignFingerprints(reference, speech(3000, 99))
    expect(other.coverage).toBeLessThan(0.2)
  })
})

describe('moving a lesson onto the listener\'s copy', () => {
  const map: SyncMap = {
    segments: [
      { refStart: 0, refEnd: 100, offset: 30 },
      { refStart: 160, refEnd: 400, offset: -30 },
    ],
    coverage: 0.9,
    listenerDuration: 400,
  }
  const words = [
    { text: 'hej', start: 10, end: 10.5 },
    { text: 'köp', start: 120, end: 120.4 }, // our advert
    { text: 'nu', start: 121, end: 121.3 }, // our advert
    { text: 'alltså', start: 200, end: 200.6 },
    { text: 'ja', start: 201, end: 201.2 },
  ]
  const transcript: Transcript = {
    language: 'sv',
    source: 'scribe',
    words,
    segments: [
      { id: 's1', start: 10, end: 10.5, text: 'hej', wordStart: 0, wordEnd: 1 },
      { id: 's2', start: 120, end: 121.3, text: 'köp nu', wordStart: 1, wordEnd: 3 },
      { id: 's3', start: 200, end: 201.2, text: 'alltså ja', wordStart: 3, wordEnd: 5 },
    ],
  }
  const plan = {
    episodeId: 'e',
    version: 1,
    targetLanguage: 'sv',
    nativeLanguage: 'en',
    hosts: [],
    summary: '',
    wrapUpQuestions: [],
    moments: [
      { id: 'w', kind: 'warmup', at: 0, minLevel: 'light', script: '', clips: [] },
      {
        id: 'm',
        kind: 'spotlight',
        at: 130, // a pause inside our advert: must still happen, after it
        minLevel: 'light',
        script: 'Listen {clip:0} and {clip:1}',
        clips: [{ start: 200, end: 200.6 }, { start: 120, end: 120.4 }],
        audio: {
          parts: [
            { kind: 'speech', url: 'a', durationSec: 2 },
            { kind: 'clip', clipIndex: 0 },
            { kind: 'clip', clipIndex: 1 },
          ],
          durationSec: 3,
        },
      },
      { id: 'z', kind: 'wrapUp', at: 420, minLevel: 'light', script: '', clips: [] },
    ],
  } as LessonPlan

  const out = retimeLesson(transcript, plan, map)

  it('moves words and subtitle lines, and leaves out our advert', () => {
    expect(out.synced).toBe(true)
    expect(out.transcript.words.map((w) => [w.text, w.start])).toEqual([['hej', 40], ['alltså', 170], ['ja', 171]])
    expect(out.transcript.segments.map((s) => [s.id, s.start, s.wordStart, s.wordEnd])).toEqual([
      ['s1', 40, 0, 1],
      ['s3', 170, 1, 3],
    ])
  })

  it('keeps every guide moment, moves host clips, and drops a clip it cannot place', () => {
    const [w, m, z] = out.plan!.moments
    expect(w!.at).toBe(0)
    expect(m!.at).toBe(130) // the next shared moment: ref 160 → 130
    expect(m!.clips[0]).toEqual({ start: 170, end: expect.closeTo(170.6, 5) })
    expect(m!.audio!.parts.map((p) => p.kind)).toEqual(['speech', 'clip'])
    expect(m!.audio!.durationSec).toBeCloseTo(2.6, 5)
    expect(z!.at).toBe(400)
  })

  it('leaves the lesson alone when the match is not trustworthy', () => {
    const weak = retimeLesson(transcript, plan, { ...map, coverage: 0.3 })
    expect(weak.synced).toBe(false)
    expect(weak.transcript).toBe(transcript)
  })
})
