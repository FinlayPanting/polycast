import { describe, expect, it } from 'vitest'
import { LEVEL_MINUTES } from '@polycast/core'
import { GUIDANCE, guidanceLevelOr } from './languages'

describe('guide intensity per episode (PC-1017-F13)', () => {
  it('offers Hands-on, Standard and Light, most to least, each saying how often the guide steps in', () => {
    expect(GUIDANCE.map((g) => g.id)).toEqual(['handsOn', 'standard', 'light'])
    expect(GUIDANCE.find((g) => g.id === 'handsOn')!.line).toMatch(/once a minute/)
    for (const g of GUIDANCE.filter((g) => g.id !== 'handsOn')) expect(g.line).toContain(`every ${LEVEL_MINUTES[g.id]} minutes`)
    for (const g of GUIDANCE) expect(g.line).not.toMatch(/!/)
  })

  it('reads a chosen level from the screen, falling back to the default', () => {
    expect(guidanceLevelOr('light', 'standard')).toBe('light')
    expect(guidanceLevelOr('loud', 'handsOn')).toBe('handsOn')
    expect(guidanceLevelOr(undefined, 'standard')).toBe('standard')
  })
})
