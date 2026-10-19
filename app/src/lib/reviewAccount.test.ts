import { describe, expect, it } from 'vitest'
import { isReviewEmail } from './reviewAccount'

describe('App Review’s password sign-in (PC-1012-04)', () => {
  it('is only for the review address, however it’s typed', () => {
    expect(isReviewEmail('review@polycast.app')).toBe(true)
    expect(isReviewEmail('  Review@Polycast.app ')).toBe(true)
  })

  it('leaves every learner on the emailed code', () => {
    expect(isReviewEmail('finlay@polycast.app')).toBe(false)
    expect(isReviewEmail('review@polycast.app.example.com')).toBe(false)
    expect(isReviewEmail('myreview@polycast.app')).toBe(false)
    expect(isReviewEmail('')).toBe(false)
  })
})
