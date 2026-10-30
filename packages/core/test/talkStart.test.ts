import { describe, expect, it } from 'vitest'
import { GuideTimeline, talkStart } from '../src/playback'
import type { GuideMoment } from '../src/types'

describe('a first guided listen starts where the talking starts (PC-1027-03)', () => {
  it('starts a second before the first line, past theme music', () => {
    expect(talkStart([{ start: 18.4 }, { start: 22 }])).toBeCloseTo(17.4)
  })

  it('skips lines inside a pre-roll advert', () => {
    expect(talkStart([{ start: 2 }, { start: 30 }, { start: 47 }, { start: 50 }], [{ start: 0, end: 45 }])).toBe(46)
  })

  it('stays at 0 when the talking starts straight away, never, or surprisingly late', () => {
    expect(talkStart([{ start: 1.5 }])).toBe(0)
    expect(talkStart([])).toBe(0)
    expect(talkStart([{ start: 400 }])).toBe(0)
  })

  it('keeps the introduction due when the timeline starts later', () => {
    const m = (id: string, at: number, kind: GuideMoment['kind']) => ({ id, at, kind }) as GuideMoment
    const t = new GuideTimeline([m('intro', 0, 'warmup'), m('a', 10, 'spotlight'), m('b', 60, 'spotlight')])
    t.seek(17, (x) => x.kind === 'warmup')
    expect(t.tick(17).map((x) => x.id)).toEqual(['intro'])
    const plain = new GuideTimeline([m('intro', 0, 'warmup')])
    plain.seek(17)
    expect(plain.tick(17)).toEqual([])
  })
})
