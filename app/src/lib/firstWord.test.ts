import { describe, expect, it } from 'vitest'
import { firstWordLine, isFirstWord } from './firstWordCore'

describe('your first saved word blooms (PC-1018-06)', () => {
  it('blooms for the very first word only', () => {
    expect(isFirstWord({ celebrated: false, wordsInLanguage: 1 })).toBe(true)
    expect(isFirstWord({ celebrated: true, wordsInLanguage: 1 })).toBe(false)
  })

  it('stays quiet for someone who already had words before it shipped', () => {
    expect(isFirstWord({ celebrated: false, wordsInLanguage: 12 })).toBe(false)
  })

  it('names the language', () => {
    expect(firstWordLine('Swedish')).toBe('Your first word in Swedish.')
  })
})
