import { describe, expect, it } from 'vitest'
import { INTERESTS, interestQueries, MAX_INTERESTS, normaliseInterests } from '../src'

describe('Interests', () => {
  it('offers about a dozen tiles with unique ids, including the ones Finlay named', () => {
    expect(INTERESTS.length).toBeGreaterThanOrEqual(10)
    expect(INTERESTS.length).toBeLessThanOrEqual(14)
    expect(new Set(INTERESTS.map((i) => i.id)).size).toBe(INTERESTS.length)
    const labels = INTERESTS.map((i) => i.label)
    for (const l of ['Sport', 'Psychology', 'Health and nutrition', 'Music', 'Comedy', 'News', 'Tech']) expect(labels).toContain(l)
    expect(INTERESTS.find((i) => i.id === 'sport')!.subs.map((s) => s.label)).toContain('Formula One')
  })

  it('writes every "why" line in plain British English, without exclamation marks', () => {
    for (const i of INTERESTS) for (const w of [i.why, ...i.subs.map((s) => s.why)]) {
      expect(w).toMatch(/^Because you/)
      expect(w).not.toMatch(/!/)
      expect(w).not.toMatch(/favorite|color/)
    }
  })

  it('cleans saved interests: unknown ids dropped, chips imply their tile, capped', () => {
    expect(normaliseInterests(['sport/f1', 'nonsense', 'music', 'music', 'sport/zzz', 7])).toEqual(['sport', 'sport/f1', 'music'])
    expect(normaliseInterests('sport')).toEqual([])
    const many = INTERESTS.map((i) => i.id)
    expect(normaliseInterests(many).length).toBe(MAX_INTERESTS)
  })

  it('looks up a narrowed tile by its chips only, otherwise the whole tile', () => {
    const q = interestQueries(['sport', 'sport/f1', 'sport/football', 'comedy'])
    expect(q.map((x) => x.key)).toEqual(['sport/f1', 'sport/football', 'comedy'])
    expect(q[0]!.source).toEqual({ search: 'Formula 1' })
    expect(q[1]!.source).toEqual({ categories: ['Soccer'] })
    expect(q[2]!.why).toBe('Because you like a laugh')
    expect(interestQueries([])).toEqual([])
  })
})

describe('Picking interests', () => {
  it('toggles tiles and chips, a chip picking its tile and a tile taking its chips with it', async () => {
    const { toggleInterest } = await import('../src')
    let s = toggleInterest([], 'sport')
    expect(s).toEqual(['sport'])
    s = toggleInterest(s, 'sport/f1')
    expect(s).toEqual(['sport', 'sport/f1'])
    s = toggleInterest(s, 'sport/f1')
    expect(s).toEqual(['sport'])
    expect(toggleInterest([], 'news/politics')).toEqual(['news', 'news/politics'])
    expect(toggleInterest(['sport', 'sport/f1', 'music'], 'sport')).toEqual(['music'])
  })

  it('adds nothing past the limit', async () => {
    const { toggleInterest } = await import('../src')
    const full = INTERESTS.slice(0, MAX_INTERESTS).map((i) => i.id)
    expect(toggleInterest(full, INTERESTS[MAX_INTERESTS]!.id)).toEqual(full)
  })
})
