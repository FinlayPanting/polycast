import { describe, expect, it } from 'vitest'
import { HOP_BACK_MS, hopBackLabel, hopBackLive, hopBackOffer } from './hopBack'

describe('hopping back after a jump from the episode map (PC-1018-10)', () => {
  it('offers the place the learner was at, for 15 seconds', () => {
    const h = hopBackOffer(1930, 300, 1_000)
    expect(h).toEqual({ to: 1930, until: 1_000 + HOP_BACK_MS })
    expect(hopBackLabel(h!)).toBe('Back to where you were, 32:10')
    expect(hopBackLive(h, 1_000 + HOP_BACK_MS - 1)).toBe(true)
    expect(hopBackLive(h, 1_000 + HOP_BACK_MS)).toBe(false)
  })

  it('offers nothing without a real place, or when the jump barely moved', () => {
    expect(hopBackOffer(undefined, 300, 0)).toBeUndefined()
    expect(hopBackOffer(0, 300, 0)).toBeUndefined()
    expect(hopBackOffer(5, 300, 0)).toBeUndefined()
    expect(hopBackOffer(310, 300, 0)).toBeUndefined()
    expect(hopBackOffer(Number.NaN, 300, 0)).toBeUndefined()
    expect(hopBackLive(undefined, 0)).toBe(false)
  })

  it('works backwards too, and past the hour', () => {
    expect(hopBackOffer(60, 1200, 0)?.to).toBe(60)
    expect(hopBackLabel({ to: 3725, until: 0 })).toBe('Back to where you were, 1:02:05')
  })
})
