import { describe, expect, it } from 'vitest'
import { plusInvite } from './plusInvite'

describe('the Plus card after the free episode', () => {
  it('sums up the listen, then offers Plus', () => {
    expect(plusInvite(true, 41.6 * 60, 6)).toEqual({ summary: 'You listened for 42 minutes and kept 6 words.', offer: 'Keep going with Plus: 5 hours a month' })
    expect(plusInvite(true, 50, 1)?.summary).toBe('You listened for 1 minute and kept 1 word.')
    expect(plusInvite(true, 600, 0)?.summary).toBe('You listened for 10 minutes.')
  })
  it('only appears on the free episode', () => {
    expect(plusInvite(false, 600, 3)).toBeUndefined()
    expect(plusInvite(undefined, 600, 3)).toBeUndefined()
  })
})
