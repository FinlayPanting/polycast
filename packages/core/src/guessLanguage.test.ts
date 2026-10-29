import { describe, expect, it } from 'vitest'
import { GUESS_TELLS, guessClip, guessReply, nextGuess } from './guessLanguage'
import { unkindReasons } from './kindness'
import { LAUNCH_LANGUAGES } from './types'

const talk = (from: number, count: number, step = 0.4) =>
  Array.from({ length: count }, (_, i) => ({ text: `w${i}`, start: from + i * step, end: from + i * step + 0.3 }))

describe('guess the language while the guide prepares (PC-1028-06)', () => {
  it('takes three seconds of the host talking, after the opening', () => {
    const words = [...talk(0, 20), ...talk(60, 20), ...talk(100, 5)]
    const clip = guessClip(words)!
    expect(clip.start).toBeGreaterThanOrEqual(20)
    expect(clip.end - clip.start).toBeCloseTo(3)
  })

  it('never spans a pause, and falls back to the opening when that’s the only talk', () => {
    // Words a second apart after the opening: no three-second run there.
    const words = [...talk(0, 12), ...talk(30, 10, 1.2)]
    expect(guessClip(words)).toEqual({ start: 0, end: 3 })
    expect(guessClip(talk(0, 5, 1))).toBeUndefined()
    expect(guessClip([])).toBeUndefined()
  })

  it('answers in one fixed line, the same tell either way, kindly', () => {
    expect(guessReply('Mia', 'sv', 'sv')).toBe('Mia: Swedish! The sing-song gave it away.')
    expect(guessReply('Leo', 'sv', 'de')).toBe('Leo: That one was Swedish. The sing-song gave it away.')
    for (const l of LAUNCH_LANGUAGES) {
      expect(GUESS_TELLS[l]).toBeDefined()
      for (const g of ['sv', 'es']) {
        const line = guessReply('Mia', l, g)
        // One cheerful '!' on a right guess is the line's whole point; nothing else from the nudge kindness check.
        expect(unkindReasons(line).filter((r) => r !== 'shouts'), line).toEqual([])
        expect((line.match(/!/g) ?? []).length).toBeLessThanOrEqual(1)
        expect(line).not.toMatch(/wrong|score|points|!!/i)
      }
    }
  })

  it('plays a different language next, when there is one', () => {
    const clips = [{ language: 'sv' }, { language: 'es' }]
    for (let i = 0; i < 10; i++) expect(nextGuess(clips, 'sv', Math.random)?.language).toBe('es')
    expect(nextGuess([{ language: 'sv' }], 'sv')?.language).toBe('sv')
    expect(nextGuess([], 'sv')).toBeUndefined()
    expect(nextGuess(clips, undefined, () => 0.999)?.language).toBe('es')
  })
})
