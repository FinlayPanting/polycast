import { LISTEN, PRIMER, SHELVES, art } from './fixtures'

/** Answers the app's API calls with sample data in demo mode. */
export async function demoCall<T>(method: string, path: string): Promise<T> {
  await new Promise((r) => setTimeout(r, 120))
  if (path.startsWith('/v1/discover/') && path.endsWith('/mood'))
    return {
      mood: 'Something calm',
      picks: [
        { kind: 'episode', episodeId: 'ep1', podcastId: 'p1', title: 'Tåget till Göteborg', podcastTitle: 'Svenska Samtal', artwork: art.samtal, why: 'Two friends chatting on a slow train: easy to follow and very relaxed.' },
        { kind: 'show', podcastId: 'p1', title: 'Svenska Samtal', author: 'Anna & Erik', artwork: art.samtal, why: 'Gentle everyday conversations, at a pace that leaves room to think.' },
      ],
    } as T
  if (path.startsWith('/v1/discover/')) return { shelves: SHELVES } as T
  if (path.startsWith('/v1/episodes/') && path.endsWith('/listen')) return LISTEN as T
  if (path.startsWith('/v1/episodes/') && path.endsWith('/primer')) return { primer: path.includes('/ep1/') ? PRIMER : null } as T
  if (path === '/v1/podcasts/open')
    return {
      podcast: { id: 'p1', title: 'Svenska Samtal', author: 'Anna & Erik', artwork: art.samtal, language: 'sv' },
      episodes: [
        { id: 'ep1', title: 'Tåget till Göteborg', published: '2026-10-05T06:00:00Z', duration_sec: 1440, image: null, status: 'ready', difficulty: { label: 'A2–B1, relaxed pace' } },
        { id: 'ep6', title: 'Vi bakar kanelbullar', published: '2026-09-28T06:00:00Z', duration_sec: 1920, image: null, status: 'none', difficulty: null },
        { id: 'ep7', title: 'Allemansrätten', published: '2026-09-21T06:00:00Z', duration_sec: 2280, image: null, status: 'ready', difficulty: { label: 'B1–B2, natural pace' } },
      ],
    } as T
  // "You already know these words" (PC-1022-08), so the preview's first run has the same screens as a phone's (PC-1028-07).
  if (path.startsWith('/v1/known-words/'))
    return {
      episodeId: 'ep1',
      episodeTitle: 'Tåget till Göteborg',
      podcastTitle: 'Svenska Samtal',
      audioUrl: LISTEN.episode.audioUrl,
      words: [
        { text: 'stationen', meaning: 'the station', clip: { start: 4, end: 4.6 } },
        { text: 'perfekt', meaning: 'perfect', clip: { start: 9, end: 9.5 } },
        { text: 'musik', meaning: 'music', clip: { start: 14, end: 14.5 } },
      ],
    } as T
  if (path === '/v1/guess-clips')
    return {
      clips: [
        { language: 'sv', audioUrl: LISTEN.episode.audioUrl, start: 2, end: 5 },
        { language: 'es', audioUrl: LISTEN.episode.audioUrl, start: 10, end: 13 },
      ],
    } as T
  if (path.startsWith('/v1/search')) return { results: [] } as T
  if (path.endsWith('/report-line')) return { ok: true } as T
  if (path === '/v1/library/new-episodes') return { shows: [] } as T
  if (path === '/v1/translate') return { to: 'en', titles: [], podcastDescription: null, episodeDescription: null } as T
  throw new Error(`Demo has no answer for ${method} ${path}`)
}
