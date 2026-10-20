import { describe, expect, it } from 'vitest'
import { ALREADY_PREPARED_LINE, estimateLine, estimateSplit, ownKeysFrom, usedLine } from './ownKeysCore'

describe('own keys on the phone (PC-1017-K1)', () => {
  it('needs both keys, trimmed', () => {
    expect(ownKeysFrom(' sk_a ', 'AIza')).toEqual({ elevenlabs: 'sk_a', gemini: 'AIza' })
    expect(ownKeysFrom('sk_a', null)).toBeUndefined()
    expect(ownKeysFrom('', 'AIza')).toBeUndefined()
  })
})

describe('cost estimate lines (PC-1017-K4)', () => {
  it('says it plainly, always as an estimate', () => {
    expect(estimateLine(0.35)).toBe('About $0.35 on your keys')
    expect(estimateSplit({ elevenlabsUSD: 0.25, googleUSD: 0.1 })).toEqual(['ElevenLabs, for the subtitles and voices: about $0.25', 'Google, for the lessons: about $0.10'])
    expect(ALREADY_PREPARED_LINE).toBe('Free, already prepared')
    expect(usedLine(0.4123)).toBe('Used about $0.40 on your keys')
    expect(usedLine(0.01)).toBe('Used about $0.05 on your keys')
  })
})
