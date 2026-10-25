import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stampDate, stampForFinish } from './stampsCore'

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
    expect(source('../player/PlayerProvider.tsx')).toMatch(/phase !== 'finished'[\s\S]{0,400}keepStampFor\(\{ guided: data\.guided, language: data\.transcript\.language \}\)/)
    const you = source('../app/(tabs)/you.tsx')
    expect(you).toMatch(/useKept\(seasonStamps\)/)
    expect(you).not.toMatch(/streak/i)
  })
})
