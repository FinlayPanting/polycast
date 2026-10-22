import type { Segment } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { LiveLineFeed, lineAt, liveLine } from './liveLine'

const seg = (i: number, start: number, end: number, translation?: string): Segment => ({ id: `s${i}`, start, end, text: `line ${i}`, translation, wordStart: 0, wordEnd: 0 })
const segments = [seg(0, 1, 4, 'one'), seg(1, 4.5, 8, 'two'), seg(2, 9, 12)]

describe('the lock-screen line (PC-1020-L1)', () => {
  it('finds the line being said, the one just finished between lines, and none before the first', () => {
    expect(lineAt(segments, 0.5)).toBe(-1)
    expect(lineAt(segments, 1)).toBe(0)
    expect(lineAt(segments, 4.2)).toBe(0)
    expect(lineAt(segments, 7.9)).toBe(1)
    expect(lineAt(segments, 50)).toBe(2)
    expect(lineAt([], 3)).toBe(-1)
  })

  it('times the bar on the wall clock, at the listening speed', () => {
    const now = 1_000_000
    expect(liveLine(segments, 1, 6, now)).toEqual({ index: 1, line: 'line 1', english: 'two', next: 'line 2', startMs: now - 1500, endMs: now + 2000 })
    const fast = liveLine(segments, 1, 6, now, 2)
    expect(fast.startMs).toBe(now - 750)
    expect(fast.endMs).toBe(now + 1000)
    expect(liveLine(segments, 2, 10, now)).toMatchObject({ english: '', next: '' })
  })

  it('sends one update per line, not per progress tick', () => {
    const sent: number[] = []
    const feed = new LiveLineFeed((l) => sent.push(l.index))
    for (let t = 0; t <= 13; t += 0.25) feed.onPosition(segments, t, t * 1000)
    expect(sent).toEqual([0, 1, 2])
    expect(feed.sent).toBe(3)
  })

  it('sends again when the speed changes or after a reset (a seek or a new listen)', () => {
    const sent: number[] = []
    const feed = new LiveLineFeed((l) => sent.push(l.index))
    feed.onPosition(segments, 2, 0)
    feed.onPosition(segments, 2.5, 500, 1.5)
    feed.reset()
    feed.onPosition(segments, 2.6, 600, 1.5)
    expect(sent).toEqual([0, 0, 0])
  })
})
