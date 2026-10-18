import { describe, expect, it } from 'vitest'
import { aboutDollars, keyGuides } from './ownKeysGuide'

describe('the own-keys set-up guide (PC-1017-K2)', () => {
  const guides = keyGuides(new Date('2026-10-18T00:00:00Z'))

  it('says what each key is for and roughly what an hour costs', () => {
    expect(guides.map((g) => g.name)).toEqual(['ElevenLabs', 'Google'])
    expect(aboutDollars(guides[0]!.hourUSD)).toMatch(/^about \$0\.\d\d$/)
    expect(guides[1]!.hourUSD).toBeLessThan(guides[0]!.hourUSD)
  })

  it('warns plainly that a free Google key is slower, before they start', () => {
    expect(guides[1]!.heads).toMatch(/free Google key works/)
    expect(guides[1]!.heads).toMatch(/billing/)
  })

  it('links to each provider’s own page, one action a step, in a calm tone', () => {
    for (const g of guides) {
      expect(g.link.url).toMatch(/^https:\/\/(elevenlabs\.io|aistudio\.google\.com)\//)
      expect(g.steps.length).toBeGreaterThanOrEqual(4)
      for (const s of g.steps) expect(s).not.toMatch(/!/)
    }
  })
})
