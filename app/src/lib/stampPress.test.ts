import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }))

import { keepStampFor } from './stamps'
import { STAMP_PRESS, stampEarnedLabel, stampPress } from './stampsCore'

describe('the stamp lands with a soft press (PC-1027-08)', () => {
  it('is pressed once per stamp: the first guided finish of the season, not the second', async () => {
    const now = new Date(2026, 9, 29, 12)
    const first = await keepStampFor({ guided: true, language: 'fr' }, now)
    expect(first).toMatchObject({ seasonId: 'all-saints-2026', name: 'Toussaint' })
    expect(await keepStampFor({ guided: true, language: 'fr' }, now)).toBeUndefined()
    expect(await keepStampFor({ guided: false, language: 'it' }, now)).toBeUndefined()
  })

  it('animates with one gentle tap as it lands, and is still with Reduce Motion on', () => {
    expect(stampPress(false)).toEqual({ animate: true, tapAtMs: STAMP_PRESS.tapAtMs })
    expect(stampPress(true)).toEqual({ animate: false, tapAtMs: 0 })
    expect(STAMP_PRESS.pressMs + STAMP_PRESS.settleMs).toBeLessThanOrEqual(600)
  })

  it('says what it is, kindly, and where to find it', () => {
    expect(stampEarnedLabel({ seasonId: 'all-saints-2026', language: 'sv', name: 'Allhelgona', earnedOn: '2026-10-31' })).toBe("New stamp: Allhelgona, 31 Oct 2026. It's in You.")
  })

  it('uses the logo’s coral, magenta and violet, a soft haptic, and the reduced-motion hook', () => {
    const src = readFileSync(new URL('../components/StampPress.tsx', import.meta.url), 'utf8')
    for (const c of ['BRAND.coral', 'BRAND.magenta', 'BRAND.violet', 'ImpactFeedbackStyle.Soft', 'useReducedMotion()']) expect(src).toContain(c)
    const wrap = readFileSync(new URL('../app/listen/[id].tsx', import.meta.url), 'utf8')
    expect(wrap).toContain('<StampPress stamp={newStamp} line={isFreshStamp(newStamp) ? freshLine(guideName(guideId)) : undefined} />')
  })
})
