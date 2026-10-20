import { describe, expect, it } from 'vitest'
import { carryOn, LIBRARY_SECTIONS, newEpisodes, recentShows, type ListenLike, type ShowEpisodes } from './libraryCore'

const listen = (id: string, podcastId: string | undefined, updated: string, opts: { pos?: number; finished?: boolean } = {}): ListenLike => ({
  episode_id: id,
  position_sec: opts.pos ?? 60,
  finished_at: opts.finished ? updated : null,
  updated_at: updated,
  episodes: { title: `Ep ${id}`, duration_sec: 1800, image: null, podcast_id: podcastId, podcasts: { title: `Show ${podcastId}`, artwork: `art-${podcastId}` } },
})

describe('Library: recently listened', () => {
  it('lists shows, not episodes, newest first and each once', () => {
    const rows = [listen('1', 'a', '2026-10-01'), listen('2', 'b', '2026-10-05'), listen('3', 'a', '2026-10-06'), listen('4', undefined, '2026-10-07')]
    expect(recentShows(rows).map((s) => s.podcastId)).toEqual(['a', 'b'])
    expect(recentShows(rows)[0]).toEqual({ podcastId: 'a', title: 'Show a', artwork: 'art-a' })
    expect(recentShows(rows, 1)).toHaveLength(1)
  })

  it('carries on only unfinished episodes that were started', () => {
    const rows = [listen('1', 'a', '2026-10-01'), listen('2', 'a', '2026-10-03', { finished: true }), listen('3', 'b', '2026-10-04', { pos: 0 }), listen('4', 'b', '2026-10-05')]
    expect(carryOn(rows).map((r) => r.episode_id)).toEqual(['4', '1'])
  })
})

describe('Library: new episodes from followed shows', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  const show = (id: string, eps: [string, string | null, string?][]): ShowEpisodes => ({
    podcast: { id, title: `Show ${id}`, artwork: `art-${id}` },
    episodes: eps.map(([eid, published, status]) => ({ id: eid, title: `Ep ${eid}`, published, duration_sec: 1200, image: null, status: status ?? 'none' })),
  })

  it('takes the last fortnight, newest first, across shows', () => {
    const shows = [show('a', [['a1', '2026-10-19T08:00:00Z', 'ready'], ['a2', '2026-09-01T08:00:00Z']]), show('b', [['b1', '2026-10-15T08:00:00Z'], ['b2', null]])]
    const out = newEpisodes(shows, now)
    expect(out.map((e) => e.episodeId)).toEqual(['a1', 'b1'])
    expect(out[0]).toMatchObject({ podcastTitle: 'Show a', image: 'art-a', ready: true })
  })

  it('leaves out episodes already started, and caps the list', () => {
    const shows = [show('a', [['a1', '2026-10-19T08:00:00Z'], ['a2', '2026-10-18T08:00:00Z'], ['a3', '2026-10-17T08:00:00Z']])]
    expect(newEpisodes(shows, now, new Set(['a1'])).map((e) => e.episodeId)).toEqual(['a2', 'a3'])
    expect(newEpisodes(shows, now, new Set(), { max: 1 })).toHaveLength(1)
  })

  it('has nothing new with no followed shows', () => {
    expect(newEpisodes([], now)).toEqual([])
  })
})

describe('Library sections', () => {
  it('open with Recently listened, then new episodes, Listen later and downloads', () => {
    expect(LIBRARY_SECTIONS.map((s) => s.title)).toEqual(['Recently listened', 'Carry on listening', 'New episodes', 'Listen later', 'Downloads'])
  })
})
