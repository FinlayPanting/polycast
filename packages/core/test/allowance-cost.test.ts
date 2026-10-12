import { describe, expect, it } from 'vitest'
import {
  cohortAlert,
  costUSD,
  decidePreparation,
  estimatePrepCostUSD,
  mayUseGuide,
  weekStartUTC,
  type AccountState,
  type ServiceState,
} from '../src'

const free = (over: Partial<AccountState> = {}): AccountState => ({ plan: 'free', signupRank: 12, freeEpisodeUsed: false, plusUsedSec: 0, ...over })
const service: ServiceState = { freeCohortSize: 100, spendCapReached: false }
const ep = (durationSec: number, ready = false) => ({ durationSec, ready })

describe('the free episode', () => {
  it('lets one of the first 100 accounts prepare one episode up to 2 hours', () => {
    expect(decidePreparation(free(), ep(45 * 60), service)).toEqual({ allowed: true, charge: 'freeEpisode' })
    expect(decidePreparation(free(), ep(2 * 3600), service)).toEqual({ allowed: true, charge: 'freeEpisode' })
  })

  it('refuses episodes over 2 hours, a second episode, and accounts outside the first 100', () => {
    expect(decidePreparation(free(), ep(2 * 3600 + 1), service)).toEqual({ allowed: false, reason: 'too-long' })
    expect(decidePreparation(free({ freeEpisodeUsed: true }), ep(600), service)).toEqual({ allowed: false, reason: 'free-used' })
    expect(decidePreparation(free({ signupRank: 101 }), ep(600), service)).toEqual({ allowed: false, reason: 'free-closed' })
  })

  it('opens up when Finlay raises the cohort size', () => {
    expect(decidePreparation(free({ signupRank: 101 }), ep(600), { ...service, freeCohortSize: 200 }).allowed).toBe(true)
  })

  it('is not used up on an episode that is already ready or being prepared', () => {
    expect(decidePreparation(free({ signupRank: 500, freeEpisodeUsed: true }), ep(9000, true), service)).toEqual({ allowed: true, charge: 'none' })
    expect(decidePreparation(free(), { durationSec: 600, ready: false, preparing: true }, service)).toEqual({ allowed: true, charge: 'none' })
  })
})

describe('Plus and the spending cap', () => {
  const plus = (usedHours: number): AccountState => ({ plan: 'plus', signupRank: 400, freeEpisodeUsed: true, plusUsedSec: usedHours * 3600 })

  it('allows up to 5 hours of new audio a month', () => {
    expect(decidePreparation(plus(4), ep(3600), service)).toEqual({ allowed: true, charge: 'plus' })
    expect(decidePreparation(plus(4.5), ep(3600), service)).toEqual({ allowed: false, reason: 'plus-limit' })
  })

  it('pauses all new preparation when the daily cap is hit, but ready episodes still play', () => {
    const capped = { ...service, spendCapReached: true }
    expect(decidePreparation(plus(0), ep(600), capped)).toEqual({ allowed: false, reason: 'service-paused' })
    expect(decidePreparation(plus(0), ep(600, true), capped).allowed).toBe(true)
  })
})

describe('guide access for free learners', () => {
  it('gives one guided ready episode a week, and keeps it on for that episode', () => {
    expect(mayUseGuide('free', 0, false)).toBe(true)
    expect(mayUseGuide('free', 1, false)).toBe(false)
    expect(mayUseGuide('free', 1, true)).toBe(true)
    expect(mayUseGuide('plus', 9, false)).toBe(true)
  })

  it('counts weeks from Monday, UTC', () => {
    expect(weekStartUTC(new Date('2026-10-14T10:00:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z')
    expect(weekStartUTC(new Date('2026-10-18T23:59:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z')
  })
})

describe('cohort alerts', () => {
  it('fires once at 50, 90 and 100 free episodes claimed', () => {
    expect(cohortAlert(49, 50)).toBe(50)
    expect(cohortAlert(50, 51)).toBeUndefined()
    expect(cohortAlert(99, 100)).toBe(100)
  })
})

describe('costs', () => {
  it('estimates under $0.60 for an hour of new audio, including the glossary', () => {
    const c = estimatePrepCostUSD(3600)
    expect(c).toBeGreaterThan(0.5)
    expect(c).toBeLessThan(0.6)
  })

  it('keeps the worst-case 2-hour free episode under $1.20', () => {
    expect(estimatePrepCostUSD(7200)).toBeLessThan(1.2)
  })

  it('skips transcription cost when the feed supplies a transcript', () => {
    expect(estimatePrepCostUSD(3600, { feedTranscript: true })).toBeLessThan(estimatePrepCostUSD(3600) - 0.2)
  })

  it('prices actual usage', () => {
    expect(costUSD({ transcriptionSec: 3600, textInTokens: 0, textOutTokens: 0, ttsAudioSec: 0 })).toBeCloseTo(0.22, 5)
  })
})
