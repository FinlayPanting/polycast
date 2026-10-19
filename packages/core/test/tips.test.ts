import { describe, expect, it } from 'vitest'
import { TIPS, TIP_PRODUCT_IDS, isTipProduct } from '../src'

describe('Support Polycast tips (PC-1017-K3)', () => {
  it('offers three sizes, smallest first, each its own App Store product', () => {
    expect(TIPS.map((t) => t.size)).toEqual(['small', 'medium', 'large'])
    expect(new Set(TIP_PRODUCT_IDS).size).toBe(3)
    for (const id of TIP_PRODUCT_IDS) expect(id).toMatch(/^com\.finlaypanting\.polycast\.tip\./)
  })

  it('tells a tip apart from Plus, so a tip never switches Plus on', () => {
    expect(isTipProduct('com.finlaypanting.polycast.tip.medium')).toBe(true)
    expect(isTipProduct('com.finlaypanting.polycast.plus.monthly')).toBe(false)
    expect(isTipProduct(undefined)).toBe(false)
    expect(isTipProduct(42)).toBe(false)
  })
})
