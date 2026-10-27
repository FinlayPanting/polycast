import { describe, expect, it } from 'vitest'
import { LAUNCH_LANGUAGES } from './index'
import { MOOD_MAX_CHARS } from './mood'
import { SEASONAL_LINES, SEASONS, addStamp, localDay, seasonalLine, seasonalMood, seasonalStamp } from './seasonal'

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

describe('New Year lines (PC-1023-04)', () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00`)
  it('show from 26 December to 18 January, then switch themselves off', () => {
    expect(seasonalLine('welcome', at('2026-12-25'))).toBeUndefined()
    expect(seasonalLine('welcome', at('2026-12-26'))).toMatch(/New year/)
    expect(seasonalLine('plusCard', at('2027-01-01'), 'Spanish')).toBe('One podcast a week in Spanish this year? Plus brings your guide to every episode.')
    expect(seasonalLine('plusCard', at('2027-01-18'), 'Swedish')).toContain('Swedish')
    expect(seasonalLine('plusCard', at('2027-01-19'), 'Swedish')).toBeUndefined()
  })

  it('skip Black Friday and never mention a discount or price', () => {
    expect(seasonalLine('welcome', at('2026-11-27'))).toBeUndefined()
    for (const l of SEASONAL_LINES) for (const s of [l.welcome, l.plusCard]) expect(s).not.toMatch(/€|%|discount|off|sale|!|\$/i)
  })

  it('fall back to a plain phrase without a language', () => {
    expect(seasonalLine('plusCard', at('2027-01-05'))).toContain('in your language this year')
  })
})

describe('seasonal stamps (PC-1024-07)', () => {
  it('names the All Saints’ stamp in each launch language, only from 28 October to 2 November', () => {
    const names = Object.fromEntries(LAUNCH_LANGUAGES.map((l) => [l, seasonalStamp(l, at(2026, 10, 31))?.name]))
    expect(names).toEqual({ es: 'Todos los Santos', fr: 'Toussaint', de: 'Allerheiligen', it: 'Ognissanti', pt: 'Finados', sv: 'Allhelgona' })
    expect(seasonalStamp('fr', at(2026, 10, 27, 23))).toBeUndefined()
    expect(seasonalStamp('fr', at(2026, 10, 28, 0))).toEqual({ seasonId: 'all-saints-2026', language: 'fr', name: 'Toussaint', earnedOn: '2026-10-28' })
    expect(seasonalStamp('fr', at(2026, 11, 2, 23))?.earnedOn).toBe('2026-11-02')
    expect(seasonalStamp('fr', at(2026, 11, 3, 0))).toBeUndefined()
    expect(seasonalStamp('xx', at(2026, 10, 30))).toBeUndefined()
  })

  it('gives one stamp per season, whatever the language, and none for a season without one', () => {
    const fr = seasonalStamp('fr', at(2026, 10, 29))!
    const es = seasonalStamp('es', at(2026, 10, 30))!
    const once = addStamp([], fr)
    expect(addStamp(once, fr)).toEqual([fr])
    expect(addStamp(once, es)).toEqual([fr])
    const later = { id: 'midsummer-2027', from: '2027-06-18', to: '2027-06-20', byLanguage: {}, stamp: { sv: 'Midsommar' } }
    const sv = seasonalStamp('sv', at(2027, 6, 19), [later])!
    expect(addStamp(once, sv).map((s) => s.name)).toEqual(['Toussaint', 'Midsommar'])
    expect(seasonalStamp('sv', at(2027, 6, 19), [{ ...later, stamp: undefined }])).toBeUndefined()
  })
})
