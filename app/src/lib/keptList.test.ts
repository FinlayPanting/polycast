import { describe, expect, it } from 'vitest'
import { followLabel, hasKept, KEPT_LIST_MAX, laterId, laterLabel, parseKept, removeKept, toggleKept, type LaterEpisode } from './keptListCore'

const ep = (id: string): LaterEpisode => ({ episodeId: id, title: `Episode ${id}`, podcastTitle: 'Show', image: null, durationSec: 1800, addedAt: '2026-10-20T00:00:00Z' })

describe('Listen later list', () => {
  it('adds an episode at the top, and a second tap takes it out again', () => {
    const one = toggleKept([], ep('a'), laterId)
    const two = toggleKept(one, ep('b'), laterId)
    expect(two.map(laterId)).toEqual(['b', 'a'])
    expect(hasKept(two, 'a', laterId)).toBe(true)
    const back = toggleKept(two, ep('a'), laterId)
    expect(back.map(laterId)).toEqual(['b'])
    expect(hasKept(back, 'a', laterId)).toBe(false)
  })

  it('removes by id and leaves the rest in order', () => {
    const list = [ep('c'), ep('b'), ep('a')]
    expect(removeKept(list, 'b', laterId).map(laterId)).toEqual(['c', 'a'])
    expect(removeKept(list, 'zz', laterId)).toHaveLength(3)
  })

  it('keeps at most the newest entries', () => {
    let list: LaterEpisode[] = []
    for (let i = 0; i < KEPT_LIST_MAX + 5; i++) list = toggleKept(list, ep(String(i)), laterId)
    expect(list).toHaveLength(KEPT_LIST_MAX)
    expect(list[0]!.episodeId).toBe(String(KEPT_LIST_MAX + 4))
  })

  it('reads back a stored list safely, dropping junk and repeats', () => {
    expect(parseKept(null, laterId)).toEqual([])
    expect(parseKept('not json', laterId)).toEqual([])
    expect(parseKept('{"a":1}', laterId)).toEqual([])
    const raw = JSON.stringify([ep('a'), null, { title: 'no id' }, ep('a'), ep('b')])
    expect(parseKept(raw, laterId).map(laterId)).toEqual(['a', 'b'])
  })

  it('labels the buttons plainly', () => {
    expect(laterLabel(false)).toBe('Listen later')
    expect(laterLabel(true)).toBe('In Listen later')
    expect(followLabel(false)).toBe('Follow')
    expect(followLabel(true)).toBe('Following')
  })
})
