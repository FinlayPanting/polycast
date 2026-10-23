import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEARCH_TRANSLATE_SETTLE_MS, settler } from './settle'

describe('search translations wait until results settle (PC-1019-06)', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('sends one request for a burst of result lists, a second and a half after the last', () => {
    const sent: string[][] = []
    const s = settler<string[]>((v) => sent.push(v))
    s.update(['a'])
    vi.advanceTimersByTime(300)
    s.update(['a', 'b'])
    vi.advanceTimersByTime(300)
    s.update(['c'])
    vi.advanceTimersByTime(SEARCH_TRANSLATE_SETTLE_MS - 1)
    expect(sent).toEqual([])
    vi.advanceTimersByTime(1)
    expect(sent).toEqual([['c']])
  })

  it('sends straight away when the search key is pressed, and not again after', () => {
    const sent: string[][] = []
    const s = settler<string[]>((v) => sent.push(v))
    s.update(['x'])
    s.flush()
    expect(sent).toEqual([['x']])
    vi.advanceTimersByTime(SEARCH_TRANSLATE_SETTLE_MS * 2)
    s.flush()
    expect(sent).toEqual([['x']])
  })

  it('sends nothing once cancelled (leaving the screen)', () => {
    const sent: string[][] = []
    const s = settler<string[]>((v) => sent.push(v))
    s.update(['x'])
    s.cancel()
    vi.advanceTimersByTime(SEARCH_TRANSLATE_SETTLE_MS * 2)
    expect(sent).toEqual([])
  })
})
