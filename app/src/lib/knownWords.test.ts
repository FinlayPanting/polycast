import { describe, expect, it } from 'vitest'
import { knownWordsHeading, knownWordsIntro, shouldShowKnownWords } from './knownWords'

const w = (text: string) => ({ text, meaning: text, clip: { start: 1, end: 2 } })

describe('You already know these words (PC-1022-08)', () => {
  it('shows only with enough words and audio to play them', () => {
    expect(shouldShowKnownWords(undefined)).toBe(false)
    expect(shouldShowKnownWords({ words: [] })).toBe(false)
    expect(shouldShowKnownWords({ audioUrl: 'https://a/x.mp3', words: [w('musica'), w('importante')] })).toBe(false)
    expect(shouldShowKnownWords({ words: [w('a1'), w('a2'), w('a3')] })).toBe(false)
    expect(shouldShowKnownWords({ audioUrl: 'https://a/x.mp3', words: [w('musica'), w('importante'), w('problema')] })).toBe(true)
  })

  it('reads warmly and plainly', () => {
    expect(knownWordsHeading('Italian')).toBe('You already know some Italian')
    expect(knownWordsIntro('Caffè Italiano')).toBe('These come up in Caffè Italiano, one of the first shows you could hear. Tap a word to hear the host say it.')
    expect(knownWordsIntro(undefined)).toContain('one of the first episodes')
  })
})
