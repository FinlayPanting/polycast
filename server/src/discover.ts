import { DISCOVER_CATEGORIES, type PodcastSummary, type TrendingPodcast } from '@polycast/core'
import { categoryChart, forYou, freshVoices, topChart, type Fetch, type ForYouShow, type NetOpts } from './catalogue'
import type { Sql } from './db'

export interface ShelfEpisode {
  episodeId: string
  podcastId: string
  title: string
  podcastTitle: string
  image: string | null
  durationSec: number
  ready: boolean
  difficulty: { band: string; label: string } | null
}

export type Shelf =
  | { id: 'for-you'; title: string; shows: ForYouShow[] }
  | { id: 'picks'; title: string; shows: { podcastId: string; title: string; author: string | null; artwork: string | null; readyEpisodes: number }[] }
  | { id: 'easy' | 'favourites'; title: string; episodes: ShelfEpisode[] }
  | { id: 'top'; title: string; shows: PodcastSummary[] }
  | { id: 'fresh'; title: string; shows: (PodcastSummary & { why: string })[] }
  | { id: `category:${string}`; title: string; shows: TrendingPodcast[] }

async function readyEpisodes(sql: Sql, where: ReturnType<Sql['unsafe']> | ReturnType<Sql>, limit: number): Promise<ShelfEpisode[]> {
  const rows = await sql`
    select e.id, e.podcast_id, e.title, coalesce(e.image, p.artwork) as image, e.duration_sec, e.difficulty, p.title as podcast_title
    from episodes e join podcasts p on p.id = e.podcast_id
    where e.status = 'ready' and not p.removed and ${where}
    order by e.ready_at desc limit ${limit}`
  return rows.map((r) => ({
    episodeId: r.id,
    podcastId: r.podcast_id,
    title: r.title,
    podcastTitle: r.podcast_title,
    image: r.image,
    durationSec: r.duration_sec,
    ready: true,
    difficulty: r.difficulty ? { band: r.difficulty.band, label: r.difficulty.label } : null,
  }))
}

/**
 * The Discover tab for one target language, shelves in the spec's order. A learner who picked
 * interests gets a For you shelf first. Empty shelves are left out.
 */
export async function discoverShelves(sql: Sql, f: Fetch, language: string, podcastIndex?: { key: string; secret: string }, interests: string[] = [], net: NetOpts = {}): Promise<Shelf[]> {
  const picks = await sql`
    select p.id, p.title, p.author, p.artwork,
      (select count(*)::int from episodes e where e.podcast_id = p.id and e.status = 'ready') as ready_episodes
    from picks k join podcasts p on p.id = k.podcast_id
    where k.language = ${language} and not p.removed order by k.position`

  const easy = await readyEpisodes(sql, sql`e.language = ${language} and e.difficulty->>'band' = 'easier'`, 20)

  const favRows = await sql`select episode_id from listener_favourites where language = ${language} order by listeners desc limit 20`
  const favIds = favRows.map((r) => r.episode_id as string)
  const favourites = favIds.length ? await readyEpisodes(sql, sql`e.id in ${sql(favIds)}`, 20) : []
  favourites.sort((a, b) => favIds.indexOf(a.episodeId) - favIds.indexOf(b.episodeId))

  const [mine, top, fresh, ...categories] = await Promise.all([
    forYou(sql, f, language, interests, podcastIndex, 30, net).catch(() => [] as ForYouShow[]),
    topChart(sql, f, language, net).catch(() => [] as PodcastSummary[]),
    freshVoices(sql, f, language, net).catch(() => []),
    ...DISCOVER_CATEGORIES.map((c) => categoryChart(sql, f, language, c, podcastIndex).catch(() => [] as TrendingPodcast[])),
  ])

  const shelves: Shelf[] = [
    { id: 'for-you', title: 'For you', shows: mine as ForYouShow[] },
    {
      id: 'picks',
      title: 'Polycast picks',
      shows: picks.map((p) => ({ podcastId: p.id, title: p.title, author: p.author, artwork: p.artwork, readyEpisodes: p.ready_episodes })),
    },
    { id: 'easy', title: 'Easy listening', episodes: easy },
    { id: 'top', title: 'Top charts', shows: top as PodcastSummary[] },
    { id: 'fresh', title: 'Fresh voices', shows: fresh as (PodcastSummary & { why: string })[] },
    ...DISCOVER_CATEGORIES.map((c, i) => ({ id: `category:${c}` as const, title: c, shows: (categories[i] ?? []) as TrendingPodcast[] })),
    { id: 'favourites', title: 'Listener favourites', episodes: favourites },
  ]
  return shelves.filter((s) => ('shows' in s ? s.shows.length > 0 : s.episodes.length > 0))
}
