import { describe, expect, it } from 'vitest'
import { BARS, PEEK, tuckedOffset } from './markGeometry'

describe('the stems tucked behind the pole', () => {
  it('leaves the pole where it is', () => {
    expect(tuckedOffset(BARS[0], 0)).toEqual({ dx: 0, dy: 0 })
  })
  it('lines every stem up with the pole, each peeking further out below it', () => {
    const pole = BARS[0]
    BARS.slice(1).forEach((bar, k) => {
      const i = k + 1
      const { dx, dy } = tuckedOffset(bar, i)
      expect(bar.x + dx).toBe(pole.x)
      expect(bar.y + dy + bar.h).toBe(pole.y + pole.h + PEEK * i)
    })
  })
  it('peeks the coral stem least and the violet stem most, as in the variant', () => {
    const bottoms = BARS.slice(1).map((b, k) => b.y + tuckedOffset(b, k + 1).dy + b.h)
    expect(bottoms).toEqual([...bottoms].sort((a, b) => a - b))
  })
})
