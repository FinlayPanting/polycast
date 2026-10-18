import { describe, expect, it } from 'vitest'
import { ownKeysFrom } from './ownKeysCore'

describe('own keys on the phone (PC-1017-K1)', () => {
  it('needs both keys, trimmed', () => {
    expect(ownKeysFrom(' sk_a ', 'AIza')).toEqual({ elevenlabs: 'sk_a', gemini: 'AIza' })
    expect(ownKeysFrom('sk_a', null)).toBeUndefined()
    expect(ownKeysFrom('', 'AIza')).toBeUndefined()
  })
})
