import { describe, expect, it } from 'vitest'
import { ownKeysCostUSD, ownKeysEstimate, toFiveCents } from '../src'

const at = new Date('2026-10-20T00:00:00Z')

describe('cost estimate on own keys (PC-1017-K4)', () => {
  it('rounds to the nearest 5 cents, never showing real work as free', () => {
    expect(toFiveCents(0.37)).toBe(0.35)
    expect(toFiveCents(0.38)).toBe(0.4)
    expect(toFiveCents(0.004)).toBe(0.05)
    expect(toFiveCents(0)).toBe(0)
    expect(toFiveCents(NaN)).toBe(0)
  })

  it('splits by provider and scales with the episode length', () => {
    const hour = ownKeysEstimate(3600, { at })
    const raw = ownKeysCostUSD(3600, at)
    expect(hour.elevenlabsUSD).toBe(toFiveCents(raw.elevenlabs))
    expect(hour.googleUSD).toBe(toFiveCents(raw.google))
    expect(hour.totalUSD).toBe(toFiveCents(raw.elevenlabs + raw.google))
    expect(ownKeysEstimate(7200, { at }).totalUSD).toBeGreaterThan(hour.totalUSD)
    for (const v of Object.values(hour)) expect(Math.round(v * 100) % 5).toBe(0)
  })

  it('applies calibration factors from logged preparations', () => {
    const base = ownKeysEstimate(3600, { at })
    const halved = ownKeysEstimate(3600, { at, calibration: { elevenlabs: 0.5, google: 1 } })
    expect(halved.elevenlabsUSD).toBeLessThan(base.elevenlabsUSD)
    expect(halved.googleUSD).toBe(base.googleUSD)
  })
})
