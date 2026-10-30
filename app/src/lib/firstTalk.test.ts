import { describe, expect, it } from 'vitest'
import { hopBackLabel } from './hopBack'
import { firstTalkStart, veryStartOffer } from './firstTalk'

const base = { guided: true, from: undefined, resumeAt: 0, firstGuided: true, segments: [{ start: 21 }, { start: 25 }] }

describe('the first guided listen starts where the talking starts (PC-1027-03)', () => {
  it('starts just before the host’s first words', () => {
    expect(firstTalkStart(base)).toBe(20)
  })

  it('skips a pre-roll advert', () => {
    expect(firstTalkStart({ ...base, segments: [{ start: 3 }, { start: 40 }], adverts: [{ start: 0, end: 35 }] })).toBe(39)
  })

  it('leaves every other start alone', () => {
    expect(firstTalkStart({ ...base, firstGuided: false })).toBeUndefined()
    expect(firstTalkStart({ ...base, guided: false })).toBeUndefined()
    expect(firstTalkStart({ ...base, resumeAt: 120 })).toBeUndefined()
    expect(firstTalkStart({ ...base, from: 300 })).toBeUndefined()
    expect(firstTalkStart({ ...base, segments: [{ start: 1 }] })).toBeUndefined()
  })

  it('offers the very start for 30 seconds', () => {
    const o = veryStartOffer(1000)
    expect(o).toMatchObject({ to: 0, until: 31_000 })
    expect(hopBackLabel(o)).toBe('Play from the very start')
  })
})
