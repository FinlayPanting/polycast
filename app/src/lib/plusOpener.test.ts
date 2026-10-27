import { describe, expect, it } from 'vitest'
import { plusOpener } from './plusOpener'

const base = { languageName: 'Italian', guideName: 'Mia' }

describe('the Plus screen starts with what you already have (PC-1023-03)', () => {
  it('names your words and finished episodes', () => {
    expect(plusOpener({ ...base, words: 14, finished: 2 })).toBe('You’ve saved 14 Italian words and finished 2 episodes with Mia.')
  })

  it('reads naturally with one of each', () => {
    expect(plusOpener({ ...base, words: 1, finished: 1 })).toBe('You’ve saved 1 Italian word and finished an episode with Mia.')
  })

  it('says only what there is', () => {
    expect(plusOpener({ ...base, words: 3 })).toBe('You’ve saved 3 Italian words so far.')
    expect(plusOpener({ ...base, finished: 4, guideName: 'Leo' })).toBe('You’ve finished 4 episodes with Leo.')
  })

  it('shows nothing for someone who has nothing yet, or when the counts could not be read', () => {
    expect(plusOpener({ ...base, words: 0, finished: 0 })).toBeUndefined()
    expect(plusOpener(base)).toBeUndefined()
  })

  it('stays warm and plain', () => {
    expect(plusOpener({ ...base, words: 14, finished: 2 })).not.toMatch(/!/)
  })
})
