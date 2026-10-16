import { describe, expect, it } from 'vitest'
import { episodeOf, formatSize, staleEpisodes, totalSize } from './storage'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const DAY = 86_400_000
const now = 100 * DAY

describe('tidying downloads', () => {
  it('reads which episode a file belongs to', () => {
    expect(episodeOf(`${A}.mp3`)).toBe(A)
    expect(episodeOf(`${A}-guide`)).toBe(A)
    expect(episodeOf(`${A}.lesson.json`)).toBe(A)
    expect(episodeOf('.DS_Store')).toBeUndefined()
  })

  it('removes episodes untouched for 30 days, unless a saved word needs them or one file is recent', () => {
    const entries = [
      { name: `${A}.mp3`, size: 1, modifiedMs: now - 40 * DAY },
      { name: `${A}.position`, size: 1, modifiedMs: now - 31 * DAY },
      { name: `${B}.mp3`, size: 1, modifiedMs: now - 40 * DAY },
      { name: `${C}.mp3`, size: 1, modifiedMs: now - 40 * DAY },
      { name: `${C}.position`, size: 1, modifiedMs: now - 2 * DAY },
    ]
    expect(staleEpisodes(entries, new Set([B]), now)).toEqual([A])
  })

  it('never removes on a guess when a file has no time', () => {
    expect(staleEpisodes([{ name: `${A}.mp3`, size: 1 }], new Set(), now)).toEqual([])
  })

  it('adds up and describes the space used', () => {
    expect(totalSize([{ name: 'a', size: 120_000_000 }, { name: 'b', size: 110_000_000 }])).toBe(230_000_000)
    expect(formatSize(230_000_000)).toBe('230 MB')
    expect(formatSize(1_420_000_000)).toBe('1.4 GB')
    expect(formatSize(0)).toBe('Nothing yet')
  })
})
