import { describe, expect, it } from 'vitest'
import { isRequestableLanguage, LAUNCH_LANGUAGES, REQUESTABLE_LANGUAGES, requestableName } from '../src'

describe('languages a learner can ask for (PC-1023-02)', () => {
  it('lists none of the launch languages and no code twice', () => {
    const codes = REQUESTABLE_LANGUAGES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of LAUNCH_LANGUAGES) expect(codes).not.toContain(c)
    expect(codes).toContain('other')
  })

  it('accepts only listed codes', () => {
    expect(isRequestableLanguage('nl')).toBe(true)
    expect(isRequestableLanguage('other')).toBe(true)
    expect(isRequestableLanguage('es')).toBe(false)
    expect(isRequestableLanguage('xx')).toBe(false)
    expect(isRequestableLanguage("nl'; drop table")).toBe(false)
    expect(isRequestableLanguage(42)).toBe(false)
  })

  it('names them in plain English', () => {
    expect(requestableName('ja')).toBe('Japanese')
    expect(requestableName('other')).toBe('Something else')
  })
})
