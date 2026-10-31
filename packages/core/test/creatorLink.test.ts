import { describe, expect, it } from 'vitest'
import { appShowUrl, isLaunchLanguage, learnWithShowLink, showNotesLine, validAppleId } from '../src'

describe("'Learn with this show' links (PC-1030-07)", () => {
  it('makes a short polycast.app link and the app address for a show', () => {
    expect(learnWithShowLink('1234567890')).toBe('https://polycast.app/show?apple=1234567890')
    expect(appShowUrl('1234567890')).toBe('polycast://show?appleId=1234567890')
    expect(() => learnWithShowLink('12&evil=1')).toThrow()
    expect(() => appShowUrl('javascript:alert(1)')).toThrow()
    expect([validAppleId('42'), validAppleId(''), validAppleId(42), validAppleId('1'.repeat(16))]).toEqual([true, false, false, false])
  })

  it('writes one ready-to-paste show-notes line in the show’s language', () => {
    const link = learnWithShowLink('555')
    expect(showNotesLine('es', link)).toBe('Learning Spanish? Hear this show with a guide on Polycast: https://polycast.app/show?apple=555')
    expect(showNotesLine('sv', link)).toMatch(/^Learning Swedish\? /)
    expect(showNotesLine('xx', link)).toMatch(/^Learning a language\? /)
  })

  it('knows the launch languages', () => {
    expect(isLaunchLanguage('pt')).toBe(true)
    expect(isLaunchLanguage('en')).toBe(false)
  })
})
