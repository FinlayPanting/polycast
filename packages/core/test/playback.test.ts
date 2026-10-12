import { describe, expect, it } from 'vitest'
import { GuideTimeline, playSteps, replayLineStart, segmentAt, type GuideMoment } from '../src'

const m = (id: string, at: number): GuideMoment => ({ id, kind: 'checkpoint', at, minLevel: 'light', script: '', clips: [] })

describe('the guide timeline', () => {
  it('plays each moment once when its time is reached', () => {
    const t = new GuideTimeline([m('b', 20), m('a', 10)])
    expect(t.tick(5)).toEqual([])
    expect(t.tick(10.1).map((x) => x.id)).toEqual(['a'])
    // Until it's marked played, it stays due (the player is busy playing it).
    expect(t.tick(10.2).map((x) => x.id)).toEqual(['a'])
    t.markPlayed('a')
    expect(t.tick(10.4)).toEqual([])
    expect(t.next(10.4)?.id).toBe('b')
  })

  it('still plays moments when ticks arrive late, as they can in the background', () => {
    const t = new GuideTimeline([m('a', 10), m('b', 12)])
    t.tick(5)
    expect(t.tick(14).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('passes silently over moments when the learner seeks forward', () => {
    const t = new GuideTimeline([m('a', 10), m('b', 20), m('c', 30)])
    t.tick(5)
    t.seek(25)
    expect(t.tick(25)).toEqual([])
    expect(t.next(25)?.id).toBe('c')
  })

  it('makes later moments due again after seeking back', () => {
    const t = new GuideTimeline([m('a', 10), m('b', 20)])
    t.tick(10.1)
    t.markPlayed('a')
    t.tick(15)
    t.seek(5)
    expect(t.tick(5.2)).toEqual([])
    expect(t.next(5.2)?.id).toBe('a')
  })

  it('plays a warm-up at 0 straight away', () => {
    const t = new GuideTimeline([m('w', 0)])
    expect(t.tick(0).map((x) => x.id)).toEqual(['w'])
  })
})

describe('moment steps', () => {
  it('turns audio parts into speech and host clips', () => {
    const moment: GuideMoment = {
      ...m('s', 40),
      clips: [{ start: 30, end: 30.6 }],
      audio: { parts: [{ kind: 'speech', url: 'u1', durationSec: 2 }, { kind: 'clip', clipIndex: 0 }, { kind: 'clip', clipIndex: 3 }], durationSec: 2.6 },
    }
    expect(playSteps(moment)).toEqual([
      { kind: 'speech', url: 'u1', durationSec: 2 },
      { kind: 'clip', start: 30, end: 30.6 },
    ])
  })
})

describe('subtitle position', () => {
  const segs = [0, 4, 9, 15].map((start, i) => ({ id: `s${i}`, start, end: start + 3.5, text: '', wordStart: 0, wordEnd: 0 }))

  it('finds the current line', () => {
    expect(segmentAt(segs, -1)).toBe(-1)
    expect(segmentAt(segs, 4)).toBe(1)
    expect(segmentAt(segs, 8.9)).toBe(1)
    expect(segmentAt(segs, 99)).toBe(3)
  })

  it('replays the current line, or the previous one just after a line starts', () => {
    expect(replayLineStart(segs, 7)).toBe(4)
    expect(replayLineStart(segs, 9.5)).toBe(4)
    expect(replayLineStart(segs, 0.5)).toBe(0)
  })
})
