import { describe, expect, it } from 'vitest'
import { worthShowing } from './translated'

describe('translated titles (PC-1017-T1)', () => {
  it('shows a translation only when it adds something', () => {
    expect(worthShowing('Tåget till Göteborg', 'The train to Gothenburg')).toBe('The train to Gothenburg')
    expect(worthShowing('Le Podcast', 'Le podcast!')).toBeUndefined()
    expect(worthShowing('Fika', null)).toBeUndefined()
  })
})
