import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARK,
  alternateIconName,
  estimateDifficulty,
  findOldFriends,
  flagsForLanguage,
  isDue,
  isKnown,
  needsOutline,
  newReview,
  nextReview,
  type SavedWord,
} from '../src'
import { wordsFrom } from './fixtures'

describe('word review', () => {
  const now = '2026-10-12T08:00:00.000Z'

  it('brings a new word back after one day, then at growing gaps', () => {
    let r = newReview(now)
    expect(r.due).toBe('2026-10-13T08:00:00.000Z')
    r = nextReview(r, 'gotIt', '2026-10-13T08:00:00.000Z')
    expect(r.due).toBe('2026-10-16T08:00:00.000Z')
    r = nextReview(r, 'gotIt', '2026-10-16T08:00:00.000Z')
    expect(r.due).toBe('2026-10-23T08:00:00.000Z')
    expect(isKnown(r)).toBe(true)
  })

  it('starts over after "again"', () => {
    const r = nextReview({ step: 4, due: now }, 'again', now)
    expect(r.step).toBe(0)
    expect(r.due).toBe('2026-10-13T08:00:00.000Z')
  })

  it('knows when a word is due', () => {
    expect(isDue({ step: 0, due: now }, '2026-10-12T09:00:00.000Z')).toBe(true)
    expect(isDue({ step: 0, due: now }, '2026-10-12T07:00:00.000Z')).toBe(false)
  })
})

describe('old friends', () => {
  const saved: SavedWord[] = [
    { lemma: 'försenad', forms: ['försenat'], meaning: 'delayed', language: 'sv', source: { episodeId: 'ep1', clip: { start: 1, end: 2 }, sentence: '' }, review: { step: 1, due: '' } },
    { lemma: 'tåg', forms: ['tåget'], meaning: 'train', language: 'sv', source: { episodeId: 'ep2', clip: { start: 1, end: 2 }, sentence: '' }, review: { step: 1, due: '' } },
  ]
  const words = wordsFrom('Bussen var Försenat. Tåget också, försenat igen')

  it('finds words learned in other episodes, once each', () => {
    expect(findOldFriends(words, saved, 'ep2', 'sv')).toEqual([{ wordIndex: 2, lemma: 'försenad' }])
    expect(findOldFriends(words, saved, 'ep9', 'sv').map((f) => f.lemma)).toEqual(['försenad', 'tåg'])
  })
})

describe('flags', () => {
  it('offers a choice of flag where a language is spoken in several countries', () => {
    expect(flagsForLanguage('pt').map((f) => f.id)).toEqual(['pt', 'br'])
    expect(flagsForLanguage('sv').map((f) => f.id)).toEqual(['se'])
  })

  it("outlines Germany's black bar on the dark background, but not bright bars", () => {
    expect(needsOutline('#000000')).toBe(true)
    expect(needsOutline('#FFCE00')).toBe(false)
  })

  it('maps flags to iOS alternate icon names, with the brand mark as the default icon', () => {
    expect(alternateIconName('se')).toBe('flag-se')
    expect(alternateIconName(DEFAULT_MARK.id)).toBeNull()
  })
})

describe('difficulty', () => {
  it('rates slow speech with common words as easier, and fast speech with rare words as challenging', () => {
    const slow = Array.from({ length: 100 }, (_, i) => ({ text: 'ord', start: i * 0.6, end: i * 0.6 + 0.5 }))
    const fast = Array.from({ length: 100 }, (_, i) => ({ text: 'ovanlig', start: i * 0.3, end: i * 0.3 + 0.28 }))
    const rankOf = (t: string) => (t === 'ord' ? 10 : 9000)
    expect(estimateDifficulty(slow, { rankOf }).band).toBe('easier')
    expect(estimateDifficulty(fast, { rankOf }).band).toBe('challenging')
    expect(estimateDifficulty(slow, { rankOf }).label).toBe('A2–B1, relaxed pace')
  })

  it('works on speed alone when no frequency list exists', () => {
    const d = estimateDifficulty(Array.from({ length: 50 }, (_, i) => ({ text: 'x', start: i * 0.4, end: i * 0.4 + 0.35 })))
    expect(d.commonCoverage).toBeUndefined()
    expect(d.wpm).toBe(171)
  })
})
