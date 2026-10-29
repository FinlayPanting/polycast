import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Shelf, ShelfEpisode } from './api'
import { firstListenLabel, goodFirstListenFrom } from './emptyStart'

const ep = (id: string, durationSec: number, o: Partial<ShelfEpisode> = {}): ShelfEpisode => ({
  episodeId: id, podcastId: 'p', title: id, podcastTitle: 'Show', image: null, durationSec, ready: true, difficulty: { band: 'easier', label: 'A2' }, ...o,
})

describe('empty screens with one thing to do (PC-1028-10)', () => {
  it('offers a ready, easy episode that fits in a sitting', () => {
    const shelves: Shelf[] = [
      { id: 'easy', title: 'Easy listening', episodes: [ep('long', 3600), ep('not-ready', 600, { ready: false }), ep('twenty', 1200), ep('twelve', 720, { difficulty: { band: 'moderate', label: 'B1' } })] },
    ]
    expect(goodFirstListenFrom(shelves)?.episodeId).toBe('twenty')
  })

  it('falls back to listener favourites, then to nothing', () => {
    expect(goodFirstListenFrom([{ id: 'easy', title: 'Easy', episodes: [] }, { id: 'favourites', title: 'Favs', episodes: [ep('fav', 900)] }])?.episodeId).toBe('fav')
    expect(goodFirstListenFrom([{ id: 'easy', title: 'Easy', episodes: [ep('x', 600, { ready: false })] }])).toBeUndefined()
    expect(goodFirstListenFrom(undefined)).toBeUndefined()
  })

  it('names the guide on the button', () => {
    expect(firstListenLabel('Leo')).toBe('Start a good first listen with Leo')
  })

  it('sits on the empty Words and Library screens and goes straight into the guided listen', () => {
    const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
    expect(read('app/(tabs)/words.tsx')).toMatch(/ListEmptyComponent=\{[\s\S]*<FirstListenStart \/>/)
    expect(read('app/(tabs)/library.tsx')).toMatch(/!data\.length && !follows\.length \? \([\s\S]*<FirstListenStart fallback=/)
    expect(read('components/FirstListenStart.tsx')).toContain("pathname: '/listen/[id]', params: { id: episode.episodeId, guide: '1'")
  })
})
