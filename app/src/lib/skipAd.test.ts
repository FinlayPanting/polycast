import { describe, expect, it } from 'vitest'
import { skipAdTarget } from './skipAd'

describe('the Skip ad pill', () => {
  const adverts = [
    { start: 0, end: 30 },
    { start: 600, end: 630 },
    { start: 630.5, end: 660 },
    { start: 1200, end: 1230 },
  ]

  it('jumps to where the episode resumes', () => {
    expect(skipAdTarget(adverts, 10)).toEqual({ resumeAt: 30, remainingSec: 20 })
    expect(skipAdTarget(adverts, 1215)?.resumeAt).toBe(1230)
  })

  it('clears back-to-back adverts in one tap', () => {
    expect(skipAdTarget(adverts, 605)).toEqual({ resumeAt: 660, remainingSec: 55 })
  })

  it("doesn't show outside an advert, or with under a second left", () => {
    expect(skipAdTarget(adverts, 300)).toBeUndefined()
    expect(skipAdTarget(adverts, 29.5)).toBeUndefined()
    expect(skipAdTarget(undefined, 10)).toBeUndefined()
    expect(skipAdTarget([], 10)).toBeUndefined()
  })
})
