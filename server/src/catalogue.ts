import {
  appleChartUrl,
  CHART_COUNTRY,
  itunesLookupUrl,
  itunesSearchUrl,
  parseAppleChart,
  parseFeed,
  parseItunesResults,
  parsePodcastIndexTrending,
  podcastIndexTrendingUrl,
  type Feed,
  type PodcastSummary,
  type TrendingPodcast,
} from '@polycast/core'
import { createHash } from 'node:crypto'
import type { Sql } from './db'

export type Fetch = typeof fetch

/** How many recent episodes of a show are listed. */
const EPISODES_KEPT = 50

/** Fetches a feed and stores the show and its recent episodes. Returns the podcast id. */
export async function syncFeed(sql: Sql, f: Fetch, feedUrl: string, apple?: Partial<PodcastSummary>): Promise<{ podcastId: string; feed: Feed }> {
  const res = await f(feedUrl, { headers: { 'User-Agent': 'Polycast/1.0 (+https://polycast.app)' } })
  if (!res.ok) throw new Error(`Feed returned ${res.status}`)
  const feed = parseFeed(await res.text())
  const language = feed.language ?? null
  const [p] = await sql`
    insert into podcasts (apple_id, feed_url, title, author, artwork, language)
    values (${apple?.appleId ?? null}, ${feedUrl}, ${feed.title}, ${feed.author ?? apple?.author ?? null}, ${apple?.artwork || feed.image || null}, ${language})
    on conflict (feed_url) do update set
      title = excluded.title, author = excluded.author, artwork = coalesce(excluded.artwork, podcasts.artwork),
      language = coalesce(excluded.language, podcasts.language), apple_id = coalesce(excluded.apple_id, podcasts.apple_id), updated_at = now()
    returning id, language`
  const podcastId = p!.id as string
  const recent = feed.episodes.filter((e) => e.durationSec && e.durationSec > 0).slice(0, EPISODES_KEPT)
  for (const e of recent) {
    await sql`
      insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, image, language)
      values (${podcastId}, ${e.guid}, ${e.title}, ${e.published ?? null}, ${e.durationSec!}, ${e.audioUrl}, ${e.image ?? null}, ${p!.language ?? 'und'})
      on conflict (podcast_id, guid) do update set title = excluded.title, audio_url = excluded.audio_url, image = excluded.image,
        duration_sec = case when episodes.status = 'none' then excluded.duration_sec else episodes.duration_sec end`
  }
  return { podcastId, feed }
}

/** Podcast search through Apple, in the target language's country. */
export async function searchPodcasts(f: Fetch, query: string, language: string): Promise<PodcastSummary[]> {
  const res = await f(itunesSearchUrl(query, CHART_COUNTRY[language]))
  if (!res.ok) throw new Error(`Search returned ${res.status}`)
  return parseItunesResults(await res.json())
}

export async function lookupApple(f: Fetch, appleId: string): Promise<PodcastSummary | undefined> {
  const res = await f(itunesLookupUrl(appleId))
  if (!res.ok) return undefined
  return parseItunesResults(await res.json())[0]
}

export function podcastIndexHeaders(key: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): Record<string, string> {
  return {
    'User-Agent': 'Polycast/1.0',
    'X-Auth-Key': key,
    'X-Auth-Date': String(nowSec),
    Authorization: createHash('sha1').update(key + secret + nowSec).digest('hex'),
  }
}

const CHART_MAX_AGE_HOURS = 24

/** A chart from the cache, refreshed from its source once a day. */
async function cachedChart<T>(sql: Sql, language: string, chart: string, load: () => Promise<T[]>): Promise<T[]> {
  const [row] = await sql`select items, fetched_at from chart_cache where language = ${language} and chart = ${chart}`
  const fresh = row && Date.now() - new Date(row.fetched_at).getTime() < CHART_MAX_AGE_HOURS * 3600_000
  if (fresh) return row.items as T[]
  try {
    const items = await load()
    await sql`insert into chart_cache (language, chart, items) values (${language}, ${chart}, ${sql.json(items as any)})
              on conflict (language, chart) do update set items = excluded.items, fetched_at = now()`
    return items
  } catch (e) {
    if (row) return row.items as T[] // a stale chart beats an empty shelf
    throw e
  }
}

export function topChart(sql: Sql, f: Fetch, language: string): Promise<PodcastSummary[]> {
  const country = CHART_COUNTRY[language]
  if (!country) return Promise.resolve([])
  return cachedChart(sql, language, 'top', async () => {
    const res = await f(appleChartUrl(country, 50))
    if (!res.ok) throw new Error(`Apple chart returned ${res.status}`)
    return parseAppleChart(await res.json())
  })
}

export function categoryChart(sql: Sql, f: Fetch, language: string, category: string, creds: { key: string; secret: string } | undefined): Promise<TrendingPodcast[]> {
  if (!creds) return Promise.resolve([])
  return cachedChart(sql, language, `category:${category}`, async () => {
    const res = await f(podcastIndexTrendingUrl(language, category, 30), { headers: podcastIndexHeaders(creds.key, creds.secret) })
    if (!res.ok) throw new Error(`Podcast Index returned ${res.status}`)
    // Podcast Index's language filter is loose; keep only feeds that say they're in the language.
    return parsePodcastIndexTrending(await res.json()).filter((p) => p.language === language)
  })
}
