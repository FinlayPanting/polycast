import { describe, expect, it } from 'vitest'
import { TIP_COPY, TIP_ERRORS, tipErrorMessage, tipOptions } from './tips'

describe('the Support Polycast screen (PC-1017-K3)', () => {
  it('shows three euro tips, smallest first, before the App Store answers', () => {
    const options = tipOptions(undefined)
    expect(options.map((o) => o.label)).toEqual(['€1.99 tip', '€4.99 tip', '€9.99 tip'])
    expect(options.every((o) => !o.available)).toBe(true)
  })

  it('uses the App Store’s own prices once they arrive, and keeps a missing one disabled', () => {
    const prices = new Map([
      ['com.finlaypanting.polycast.tip.small', '£1.99'],
      ['com.finlaypanting.polycast.tip.large', '£9.99'],
    ])
    const options = tipOptions(prices)
    expect(options.map((o) => [o.label, o.available])).toEqual([
      ['£1.99 tip', true],
      ['€4.99 tip', false],
      ['£9.99 tip', true],
    ])
  })

  it('says plainly that a tip unlocks nothing', () => {
    expect(TIP_COPY.noUnlock).toMatch(/doesn’t unlock anything/)
    // House style: warm and plain, no exclamation marks.
    for (const line of Object.values(TIP_COPY)) expect(line).not.toMatch(/!/)
  })

  it('never blames the learner when a tip fails, and names a dropped signal', () => {
    expect(tipErrorMessage(new Error('Network request failed'))).toBe(TIP_ERRORS.offline)
    expect(tipErrorMessage({ code: 'STORE_PROBLEM_ERROR' })).toBe(TIP_ERRORS.failed)
    expect(tipErrorMessage(undefined)).toBe(TIP_ERRORS.failed)
  })
})
