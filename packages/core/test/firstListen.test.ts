import { describe, expect, it } from 'vitest'
import { goodFirstListen } from '../src/firstListen'

const ep = (id: string, min: number, band?: 'easier' | 'moderate' | 'challenging') => ({ id, duration_sec: min * 60, difficulty: band ? { band } : null })

describe('the good first listen on a show page', () => {
  it('picks the easiest of the latest episodes that fits in one sitting', () => {
    expect(goodFirstListen([ep('a', 25, 'challenging'), ep('b', 28, 'easier'), ep('c', 20, 'moderate')])).toBe('b')
  })
  it('prefers one sitting over an easier but long episode', () => {
    expect(goodFirstListen([ep('long', 70, 'easier'), ep('short', 26, 'moderate')])).toBe('short')
  })
  it('breaks ties by length, then by newest', () => {
    expect(goodFirstListen([ep('a', 29), ep('b', 22), ep('c', 22)])).toBe('b')
  })
  it('ranks an episode not yet prepared between moderate and challenging', () => {
    expect(goodFirstListen([ep('unknown', 20), ep('mod', 25, 'moderate')])).toBe('mod')
    expect(goodFirstListen([ep('hard', 20, 'challenging'), ep('unknown', 25)])).toBe('unknown')
  })
  it('only looks at the latest five', () => {
    expect(goodFirstListen([ep('1', 50), ep('2', 50), ep('3', 50), ep('4', 50), ep('5', 50), ep('old', 10, 'easier')])).not.toBe('old')
  })
  it('tags nothing when there is no choice to make', () => {
    expect(goodFirstListen([ep('only', 20, 'easier')])).toBeUndefined()
    expect(goodFirstListen([])).toBeUndefined()
    expect(goodFirstListen([ep('a', 20), ep('unknown-length', 0)])).toBeUndefined()
  })
})
