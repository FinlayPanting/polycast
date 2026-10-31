import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FRESH_LINE, freshLine, freshStamp, isFreshStamp, isoWeek, stampDate, stampForFinish } from './stampsCore'

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12)

describe('seasonal stamps on the phone (PC-1024-07)', () => {
  it('a guided episode finished on the All Saints’ weekend earns the stamp in its language', () => {
    expect(stampForFinish({ guided: true, language: 'de' }, at(2026, 11, 1))).toMatchObject({ seasonId: 'all-saints-2026', name: 'Allerheiligen', earnedOn: '2026-11-01' })
  })

  it('subtitles-only listens and other days earn nothing', () => {
    expect(stampForFinish({ guided: false, language: 'de' }, at(2026, 11, 1))).toBeUndefined()
    expect(stampForFinish({ guided: true, language: 'de' }, at(2026, 11, 5))).toBeUndefined()
  })

  it('shows the day it was earned', () => {
    expect(stampDate({ seasonId: 'x', language: 'sv', name: 'Allhelgona', earnedOn: '2026-10-31' })).toBe('31 Oct 2026')
    expect(stampDate({ seasonId: 'x', language: 'sv', name: 'Allhelgona', earnedOn: 'soon' })).toBe('')
  })

  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  it('the player keeps the stamp when a listen finishes, and You shows stamps without any streak talk', () => {
    expect(source('../player/PlayerProvider.tsx')).toMatch(/phase !== 'finished'[\s\S]{0,400}keepStampFor\(\{ guided: data\.guided, language: data\.transcript\.language, published: data\.episode\.published \}\)/)
    const you = source('../app/(tabs)/you.tsx')
    expect(you).toMatch(/useKept\(seasonStamps\)/)
    expect(you).not.toMatch(/streak/i)
  })})

describe('Fresh off the press (PC-1030-08)', () => {
  const morning = (d: number) => new Date(2026, 9, d, 7).toISOString()

  it('a guided episode finished the day it came out presses a Fresh stamp', () => {
    const s = freshStamp({ guided: true, language: 'es', published: morning(31) }, at(2026, 10, 31))
    expect(s).toEqual({ seasonId: `fresh-${isoWeek(at(2026, 10, 31))}`, language: 'es', name: 'Fresh', earnedOn: '2026-10-31' })
    expect(isFreshStamp(s!)).toBe(true)
  })

  it('not the next day, not without the guide, and not without a date', () => {
    expect(freshStamp({ guided: true, language: 'es', published: morning(30) }, at(2026, 10, 31))).toBeUndefined()
    expect(freshStamp({ guided: false, language: 'es', published: morning(31) }, at(2026, 10, 31))).toBeUndefined()
    expect(freshStamp({ guided: true, language: 'es', published: null }, at(2026, 10, 31))).toBeUndefined()
    expect(freshStamp({ guided: true, language: 'es', published: 'soon' }, at(2026, 10, 31))).toBeUndefined()
    expect(freshStamp({ guided: true, language: 'es' }, at(2026, 10, 31))).toBeUndefined()
  })

  it('at most once a week: the same id all week, a new one the next', () => {
    expect(isoWeek(new Date(2026, 9, 26))).toBe('2026-W44') // Monday
    expect(isoWeek(new Date(2026, 10, 1))).toBe('2026-W44') // Sunday
    expect(isoWeek(new Date(2026, 10, 2))).toBe('2026-W45')
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53')
    expect(isoWeek(new Date(2026, 0, 1))).toBe('2026-W01')
    const mon = freshStamp({ guided: true, language: 'es', published: new Date(2026, 9, 26, 6).toISOString() }, new Date(2026, 9, 26, 20))
    const fri = freshStamp({ guided: true, language: 'fr', published: morning(30) }, at(2026, 10, 30))
    expect(mon!.seasonId).toBe(fri!.seasonId)
  })

  it('the guide says one line under it, and it is never announced', () => {
    expect(FRESH_LINE).toBe('Heard the day it aired. Very up to date.')
    expect(freshLine('Mia')).toBe('Mia: “Heard the day it aired. Very up to date.”')
    const changelog = readFileSync(new URL('../../../server/changelog.json', import.meta.url), 'utf8')
    expect(changelog).not.toContain('PC-1030-08')
  })
})
