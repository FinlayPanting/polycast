import { describe, expect, it } from 'vitest'
import { LAUNCH_LANGUAGES } from './index'
import { MOOD_MAX_CHARS } from './mood'
import { SEASONS, localDay, seasonalMood } from './seasonal'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)

describe('the All Saints’ weekend pick on Discover (PC-1021-08)', () => {
  it('shows from 28 October to 2 November, in the learner’s own time zone, then switches itself off', () => {
    expect(seasonalMood('fr', at(2026, 10, 27, 23))).toBeUndefined()
    expect(seasonalMood('fr', at(2026, 10, 28, 0))?.chip).toBe('Something spooky for la Toussaint')
    expect(seasonalMood('fr', at(2026, 11, 2, 23))?.seasonId).toBe('all-saints-2026')
    expect(seasonalMood('fr', at(2026, 11, 3, 0))).toBeUndefined()
    expect(seasonalMood('fr', at(2027, 10, 30))).toBeUndefined()
    expect(localDay(at(2026, 1, 5))).toBe('2026-01-05')
  })

  it('has a pick and a note for every launch language, short enough to send as a mood', () => {
    const s = SEASONS.find((x) => x.id === 'all-saints-2026')!
    for (const lang of LAUNCH_LANGUAGES) {
      const m = s.byLanguage[lang]
      expect(m, lang).toBeDefined()
      expect(m!.chip.length).toBeLessThanOrEqual(MOOD_MAX_CHARS)
      expect(m!.note.length).toBeLessThanOrEqual(140)
      expect(m!.note).not.toMatch(/!/)
    }
    expect(seasonalMood('xx', at(2026, 10, 30))).toBeUndefined()
  })

  it('works as a template: a later season shows on its own dates', () => {
    const later = [{ id: 'x', from: '2027-06-01', to: '2027-06-02', byLanguage: { sv: { chip: 'Midsommar', note: 'Note.' } } }]
    expect(seasonalMood('sv', at(2027, 6, 2), later)?.chip).toBe('Midsommar')
    expect(seasonalMood('sv', at(2027, 6, 3), later)).toBeUndefined()
  })
})
