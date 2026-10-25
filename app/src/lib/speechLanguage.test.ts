import { readFileSync } from 'node:fs'
import { LAUNCH_LANGUAGES } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { ENGLISH_SPEECH, speechLanguage } from './speechLanguage'

describe('speechLanguage (PC-1024-04)', () => {
  it('gives VoiceOver each launch language', () => {
    for (const code of LAUNCH_LANGUAGES) expect(speechLanguage(code)).toBe(code)
    expect(speechLanguage('sv-SE')).toBe('sv')
    expect(speechLanguage('PT_br')).toBe('pt')
  })

  it('leaves unknown or missing languages to the phone', () => {
    expect(speechLanguage(undefined)).toBeUndefined()
    expect(speechLanguage(null)).toBeUndefined()
    expect(speechLanguage('')).toBeUndefined()
    expect(speechLanguage('xx')).toBeUndefined()
  })

  it('reads meanings and translations in British English', () => {
    expect(ENGLISH_SPEECH).toBe('en-GB')
  })

  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  it.each([
    ['../components/Subtitles.tsx', 1],
    ['../components/Primer.tsx', 1],
    ['../app/(tabs)/words.tsx', 1],
    ['../app/review.tsx', 1],
  ])('%s tags its learner-language and English text', (path, english) => {
    const s = source(path)
    expect(s).toMatch(/accessibilityLanguage=\{(lang|speech)\}/)
    expect(s.match(/accessibilityLanguage=\{ENGLISH_SPEECH\}/g)?.length ?? 0).toBeGreaterThanOrEqual(english)
  })

  it('the player and episode page tell the subtitles and primer which language they are in', () => {
    expect(source('../app/listen/[id].tsx')).toMatch(/<Subtitles[\s\S]*?language=\{data\.transcript\.language\}/)
    expect(source('../app/episode/[id].tsx')).toMatch(/<Primer [^>]*language=\{profile\?\.target_language\}/)
  })
})
