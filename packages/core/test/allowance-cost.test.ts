import { describe, expect, it } from 'vitest'
import {
  cohortAlert,
  costUSD,
  pricesOn,
  PRICES_2026,
  PRICES_2027,
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

const AUTUMN_2026 = new Date('2026-10-15T12:00:00Z')

describe('costs', () => {
  // Chirp 3 HD voices since 13 Oct 2026 (was Gemini TTS at about $0.20 an hour less), plus Scribe's
  // name-spelling edit (30% on transcription, about $0.07 an hour); docs/DECISIONS.md.
  it('estimates under $0.85 for an hour of new audio, including the glossary', () => {
    const c = estimatePrepCostUSD(3600, { at: AUTUMN_2026 })
    expect(c).toBeGreaterThan(0.75)
    expect(c).toBeLessThan(0.85)
  })

  it('keeps the worst-case 2-hour free episode under $1.70', () => {
    expect(estimatePrepCostUSD(7200, { at: AUTUMN_2026 })).toBeLessThan(1.7)
  })

  it('skips transcription cost when the feed supplies a transcript', () => {
    expect(estimatePrepCostUSD(3600, { feedTranscript: true })).toBeLessThan(estimatePrepCostUSD(3600) - 0.2)
  })

  it('prices actual usage', () => {
    expect(costUSD({ transcriptionSec: 3600, textInTokens: 0, textOutTokens: 0, ttsAudioSec: 0 })).toBeCloseTo(0.22, 5)
  })

  it("switches to Google's 2027 prices at midnight UTC on 1 Jan 2027", () => {
    const text = { transcriptionSec: 0, textInTokens: 1e6, textOutTokens: 1e6, ttsAudioSec: 0 }
    expect(costUSD(text, new Date('2026-12-31T23:59:59Z'))).toBeCloseTo(0.75 + 3.75, 6)
    expect(costUSD(text, new Date('2027-01-01T00:00:00Z'))).toBeCloseTo(1.5 + 7.5, 6)
    // Gemini Flash TTS: 25 audio tokens a second, $9 then $18 a million.
    const tts = { transcriptionSec: 0, textInTokens: 0, textOutTokens: 0, ttsAudioSec: 40_000 }
    expect(costUSD(tts, new Date('2026-12-31T12:00:00Z'))).toBeCloseTo(9, 6)
    expect(costUSD(tts, new Date('2027-01-02T12:00:00Z'))).toBeCloseTo(18, 6)
    expect(pricesOn(new Date('2026-06-01')).ttsLitePerAudioSec * 40_000).toBeCloseTo(6, 6)
    expect(pricesOn(new Date('2027-06-01')).ttsLitePerAudioSec * 40_000).toBeCloseTo(12, 6)
    // Scribe and Chirp 3 HD aren't changing.
    expect(PRICES_2027.transcriptionPerSec).toBe(PRICES_2026.transcriptionPerSec)
    expect(PRICES_2027.ttsPerChar).toBe(PRICES_2026.ttsPerChar)
  })

  it('estimates an hour of new audio honestly in 2027: about $0.15 more, as only the text model doubles', () => {
    const before = estimatePrepCostUSD(3600, { at: AUTUMN_2026 })
    const after = estimatePrepCostUSD(3600, { at: new Date('2027-01-01T00:00:00Z') })
    expect(after - before).toBeCloseTo(45_000 * 0.75e-6 + 30_000 * 3.75e-6, 6)
    expect(after).toBeLessThan(1)
  })
})
