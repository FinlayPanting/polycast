import { describe, expect, it } from 'vitest'
import { reviewNotes, REVIEW_NOTES_MAX, type ChangelogEntry } from '../src/changelog'
import { dateSwitchedFeatures, dateSwitchedNotes, dayMonth, dayRange, NIGHT_OWL } from '../src/dateSwitched'
import { SEASONAL_LINES, SEASONS } from '../src/seasonal'

describe('App Review notes name every date-switched feature (PC-1026-05)', () => {
  it('writes dates the way people read them', () => {
    expect(dayMonth('2026-10-28')).toBe('28 Oct')
    expect(dayMonth('01-18')).toBe('18 Jan')
    expect(dayRange('2026-12-26', '2027-01-18')).toBe('26 Dec to 18 Jan')
  })

  it('lists the All Saints’ mood and stamp, the New Year lines and the 11 pm goodnight, each with how to see it', () => {
    const f = dateSwitchedFeatures()
    const text = f.map((x) => `${x.name} ${x.when} ${x.howToSee}`).join('\n')
    expect(text).toMatch(/Seasonal mood pick on Discover/)
    expect(text).toMatch(/Seasonal stamp in You/)
    expect(text).toMatch(/welcome screen/)
    expect(text).toMatch(/goodnight/)
    expect(text).toContain('11 pm to 4 am')
    for (const x of f) expect(x.howToSee).toMatch(/Settings → General → Date & Time/)
  })

  it('names every season and seasonal line there is, so a new one is never left out', () => {
    const ids = dateSwitchedFeatures().map((x) => x.id)
    for (const s of SEASONS) expect(ids).toContain(`${s.id}-mood`)
    for (const s of SEASONS.filter((s) => s.stamp)) expect(ids).toContain(`${s.id}-stamp`)
    for (const l of SEASONAL_LINES) expect(ids).toContain(l.id)
    expect(ids).toContain('night-owl')
    expect(NIGHT_OWL).toEqual({ fromHour: 23, untilHour: 4 })
  })

  it('puts them in every set of Notes for Review, in full, even when the change lines must be cut', () => {
    const dated = dateSwitchedNotes()
    expect(reviewNotes([])).toContain(dated)
    const many: ChangelogEntry[] = Array.from({ length: 80 }, (_, i) => ({ id: `PC-${i}`, date: '2026-10-20', kind: 'Feature', title: `Title ${i}`, description: 'x'.repeat(120) }))
    const text = reviewNotes(many)
    expect(text.length).toBeLessThanOrEqual(REVIEW_NOTES_MAX)
    expect(text).toContain(dated)
    for (const m of many) expect(text).toContain(`- ${m.title}`)
  })
})
