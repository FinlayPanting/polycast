import {
  appleChartUrl,
  cleanDescription,
  feedDescriptionFromHead,
  CHART_COUNTRY,
  feedLanguageFromHead,
  FRESH_VOICES,
  freshVoiceWhy,
  interestQueries,
  interleaveCharts,
  itunesLookupManyUrl,
  itunesLookupUrl,
  itunesSearchUrl,
  parseAppleChart,
  parseFeed,
  parseItunesResults,
  parsePodcastIndexTrending,
  sameShowTitle,
  podcastIndexTrendingUrl,
  TOP_CHART_COUNTRIES,
  type Feed,
  type PodcastSummary,
  type TrendingPodcast,
} from '@polycast/core'
import { createHash } from 'node:crypto'
import type { Sql } from './db'
import { POLYCAST_UA, safeFetch, safeOpen, type LookupHost } from './safeFetch'

export type Fetch = typeof fetch

/** How many recent episodes of a show are listed. */
const EPISODES_KEPT = 50

/**
 * Fetches a feed and stores the show and its recent episodes. Returns the podcast id. The address
 * comes from the app, so it is fetched safely: public addresses only, within a time and size limit.
 */
export async function syncFeed(
  sql: Sql,
  f: Fetch,
  feedUrl: string,
  apple?: Partial<PodcastSummary>,
  opts: { lookupHost?: LookupHost } = {},
): Promise<{ podcastId: string; feed: Feed }> {
  const res = await safeFetch(feedUrl, { fetch: f, lookupHost: opts.lookupHost, headers: POLYCAST_UA })
  if (!res.ok) throw new Error(`Feed returned ${res.status}`)
  const feed = parseFeed(new TextDecoder().decode(res.body))
  const language = feed.language ?? null
  const [p] = await sql`
    insert into podcasts (apple_id, feed_url, title, author, artwork, language, description)
    values (${apple?.appleId ?? null}, ${feedUrl}, ${feed.title}, ${feed.author ?? apple?.author ?? null}, ${apple?.artwork || feed.image || null}, ${language}, ${cleanDescription(feed.description) ?? null})
    on conflict (feed_url) do update set
      title = excluded.title, description = coalesce(excluded.description, podcasts.description), author = excluded.author, artwork = coalesce(excluded.artwork, podcasts.artwork),
      language = coalesce(excluded.language, podcasts.language), apple_id = coalesce(excluded.apple_id, podcasts.apple_id), updated_at = now()
    returning id, language`
  const podcastId = p!.id as string
  const recent = feed.episodes.filter((e) => e.durationSec && e.durationSec > 0).slice(0, EPISODES_KEPT)
  for (const e of recent) {
    if (e.formerGuid) {
      // A copy saved between 23 and 26 Oct under its audio address takes back its original ID, keeping the learner's progress (PC-1025-02).
      await sql`update episodes set guid = ${e.guid} where podcast_id = ${podcastId} and guid = ${e.formerGuid}
        and not exists (select 1 from episodes x where x.podcast_id = ${podcastId} and x.guid = ${e.guid})`
    }
    await sql`
      insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, image, language, description)
      values (${podcastId}, ${e.guid}, ${e.title}, ${e.published ?? null}, ${e.durationSec!}, ${e.audioUrl}, ${e.image ?? null}, ${p!.language ?? 'und'}, ${cleanDescription(e.description) ?? null})
      on conflict (podcast_id, guid) do update set title = excluded.title, audio_url = excluded.audio_url, image = excluded.image, description = excluded.description,
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

/** How much of a feed is read to find its <language> tag. */
const FEED_HEAD_BYTES = 64 * 1024
const FEED_CHECK_CONCURRENCY = 8
const FEED_CHECK_TIMEOUT_MS = 8000

/** How the server reaches feeds: the address check can be swapped in tests. */
export interface NetOpts {
  lookupHost?: LookupHost
}

/**
 * Reads just the start of a feed and returns the language its channel declares, and its description.
 * Through the safe fetch (PC-1022-01): a feed that is, or redirects to, a private address is never read.
 */
async function feedHead(f: Fetch, feedUrl: string, net: NetOpts = {}): Promise<{ language?: string; description?: string } | undefined> {
  const { res } = await safeOpen(feedUrl, { fetch: f, lookupHost: net.lookupHost, headers: POLYCAST_UA, timeoutMs: FEED_CHECK_TIMEOUT_MS })
  if (!res.ok || !res.body) return undefined
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let head = ''
  try {
    while (head.length < FEED_HEAD_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      head += decoder.decode(value, { stream: true })
      if (/<item[\s>]/i.test(head)) break
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return { language: feedLanguageFromHead(head), description: feedDescriptionFromHead(head) }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Keeps only chart shows whose own feed says they're in the language. Apple's country charts mix
 * in English-language shows, so each show's feed is checked (from the database when known).
 * Shows whose feed can't be found or doesn't declare a language are left out.
 */
export async function keepShowsInLanguage(sql: Sql, f: Fetch, shows: PodcastSummary[], language: string, net: NetOpts = {}): Promise<PodcastSummary[]> {
  if (shows.length === 0) return []
  const feeds = new Map<string, string>()
  for (let i = 0; i < shows.length; i += 150) {
    const batch = shows.slice(i, i + 150)
    const res = await f(itunesLookupManyUrl(batch.map((s) => s.appleId)))
    if (!res.ok) throw new Error(`Apple lookup returned ${res.status}`)
    for (const r of parseItunesResults(await res.json())) if (r.feedUrl) feeds.set(r.appleId, r.feedUrl)
  }
  const known = new Map<string, { language: string; description?: string }>()
  const feedUrls = [...feeds.values()]
  if (feedUrls.length) {
    const rows = await sql`select feed_url, language, description from podcasts where feed_url in ${sql(feedUrls)} and language is not null`
    for (const r of rows) known.set(r.feed_url, { language: r.language, description: r.description ?? undefined })
  }
  const heads = await mapLimit(shows, FEED_CHECK_CONCURRENCY, async (s) => {
    const feedUrl = feeds.get(s.appleId)
    if (!feedUrl) return undefined
    return known.get(feedUrl) ?? (await feedHead(f, feedUrl, net).catch(() => undefined))
  })
  return shows
    .map((s, i) => ({ s, head: heads[i] }))
    .filter(({ head }) => head?.language === language)
    .map(({ s, head }) => ({ ...s, feedUrl: feeds.get(s.appleId), ...(head?.description ? { description: head.description } : {}) }))
}

/** The Top charts shelf: Apple's charts for the language's countries, only shows in that language. */
export function topChart(sql: Sql, f: Fetch, language: string, net: NetOpts = {}): Promise<PodcastSummary[]> {
  const countries = TOP_CHART_COUNTRIES[language]
  if (!countries?.length) return Promise.resolve([])
  // A new cache key (v2), so charts cached before shows carried their description aren't served.
  return cachedChart(sql, language, 'top:in-language:v2', async () => {
    const charts = await Promise.all(
      countries.map(async (country) => {
        const res = await f(appleChartUrl(country, 50))
        if (!res.ok) throw new Error(`Apple chart returned ${res.status}`)
        return parseAppleChart(await res.json(), country)
      }),
    )
    return (await keepShowsInLanguage(sql, f, interleaveCharts(charts), language, net)).slice(0, 50)
  })
}

/**
 * Fresh voices (PC-1023-05): Spotify's RADAR 2026 shows for the language, each found in Apple's catalogue
 * by its exact title in its own country, then kept only when its public feed is in the language. Refreshed
 * once a day like the charts; a show that can't be found is simply left out.
 */
export function freshVoices(sql: Sql, f: Fetch, language: string, net: NetOpts = {}): Promise<(PodcastSummary & { why: string })[]> {
  const list = FRESH_VOICES[language]
  if (!list?.length) return Promise.resolve([])
  return cachedChart(sql, language, 'fresh-voices:radar-2026', async () => {
    const found = await mapLimit(list, 4, async (v) => {
      const res = await f(itunesSearchUrl(v.title, v.country, 10)).catch(() => undefined)
      if (!res?.ok) return undefined
      const hit = parseItunesResults(await res.json()).find((r) => sameShowTitle(r.title, v.title))
      return hit ? { ...hit, why: freshVoiceWhy(v.country) } : undefined
    })
    const shows = found.filter((s): s is PodcastSummary & { why: string } => Boolean(s))
    const kept = await keepShowsInLanguage(sql, f, shows, language, net)
    const why = new Map(shows.map((s) => [s.appleId, s.why]))
    return kept.map((s) => ({ ...s, why: why.get(s.appleId) ?? freshVoiceWhy('') }))
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

/** A show on the For you shelf, with the line saying why it's there. */
export type ForYouShow = (PodcastSummary | TrendingPodcast) & { why: string }

/** Apple search in each of the language's chart countries, keeping only shows in the language. */
function searchInLanguage(sql: Sql, f: Fetch, language: string, term: string, net: NetOpts = {}): Promise<PodcastSummary[]> {
  const countries = TOP_CHART_COUNTRIES[language]
  if (!countries?.length) return Promise.resolve([])
  return cachedChart(sql, language, `search:${term}`, async () => {
    const results = await Promise.all(
      countries.map(async (country) => {
        const res = await f(itunesSearchUrl(term, country))
        if (!res.ok) throw new Error(`Search returned ${res.status}`)
        return parseItunesResults(await res.json())
      }),
    )
    return (await keepShowsInLanguage(sql, f, interleaveCharts(results), language, net)).slice(0, 30)
  })
}

/**
 * Shows in the target language matching a learner's interests, each with a "why" line. Results
 * from each interest are alternated so one doesn't crowd out the rest. Lookups are cached daily
 * and free (no AI is used).
 */
export async function forYou(sql: Sql, f: Fetch, language: string, interests: string[], creds: { key: string; secret: string } | undefined, max = 30, net: NetOpts = {}): Promise<ForYouShow[]> {
  const queries = interestQueries(interests)
  if (!queries.length) return []
  const lists = await Promise.all(
    queries.map(async (q): Promise<ForYouShow[]> => {
      const shows: (PodcastSummary | TrendingPodcast)[] = await ('search' in q.source
        ? searchInLanguage(sql, f, language, q.source.search, net)
        : categoryChart(sql, f, language, q.source.categories.join(','), creds)
      ).catch(() => [])
      return shows.map((s) => ({ ...s, why: q.why }))
    }),
  )
  const showKey = (s: ForYouShow) => ('appleId' in s ? `a${s.appleId}` : `p${s.podcastIndexId}`)
  return interleaveCharts(lists, showKey).slice(0, max)
}
