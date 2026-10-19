import { describe, expect, it } from 'vitest'
import { DEFAULT_ANNUAL, DEFAULT_MONTHLY, yearlyValueLine } from './planValue'

describe('the yearly plan does the sum for the learner', () => {
  it('shows the monthly equivalent and the saving at launch prices', () => {
    expect(yearlyValueLine(DEFAULT_ANNUAL, DEFAULT_MONTHLY)).toBe('€4.08 a month, billed yearly: 18% less than monthly')
  })

  it('follows the App Store prices in other currencies', () => {
    expect(yearlyValueLine({ amount: 34.99, currency: 'GBP' }, { amount: 4.49, currency: 'GBP' })).toBe('£2.91 a month, billed yearly: 35% less than monthly')
  })

  it('never rounds the monthly figure up', () => {
    expect(yearlyValueLine({ amount: 39.99, currency: 'USD' }, { amount: 4.99, currency: 'USD' })).toMatch(/^US\$3\.33 a month/)
  })

  it('says nothing when there is no honest saving to show', () => {
    expect(yearlyValueLine(undefined, DEFAULT_MONTHLY)).toBeNull()
    expect(yearlyValueLine({ amount: 60, currency: 'EUR' }, DEFAULT_MONTHLY)).toBeNull()
    expect(yearlyValueLine({ amount: 39, currency: 'GBP' }, DEFAULT_MONTHLY)).toBeNull()
    expect(yearlyValueLine({ amount: 0, currency: 'EUR' }, DEFAULT_MONTHLY)).toBeNull()
  })
})
