import { XMLParser } from 'fast-xml-parser'

export interface FeedTranscriptLink {
  url: string
  type: string
  language?: string
}

export interface FeedEpisode {
  guid: string
  title: string
  /** ISO date, or undefined if the feed's date can't be read. */
  published?: string
  durationSec?: number
  audioUrl: string
  description?: string
  image?: string
  /** Podcasting 2.0 <podcast:transcript> links the publisher provides. */
  transcripts: FeedTranscriptLink[]
}

export interface Feed {
  title: string
  author?: string
  language?: string
  image?: string
  description?: string
  episodes: FeedEpisode[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  removeNSPrefix: false,
  isArray: (name) => ['item', 'entry', 'podcast:transcript', 'link'].includes(name),
})

function text(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim() || undefined
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) return text((v as Record<string, unknown>)['#text'])
  return undefined
}

/** "1:02:03", "62:03", "3723" or "3723.5" → seconds. */
export function parseDuration(raw: string | number | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined
  const s = String(raw).trim()
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s))
  const parts = s.split(':').map(Number)
  if (parts.some((p) => Number.isNaN(p))) return undefined
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0))
}

function isoDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const t = Date.parse(raw)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

/** Parses an RSS or Atom podcast feed. Throws if the document is not a feed. */
export function parseFeed(xml: string): Feed {
  const start = xml.trimStart()
  if (!/^<(\?xml|rss|feed|channel)/.test(start)) throw new Error('Not a podcast feed')
  const doc = parser.parse(xml) as Record<string, any>
  const channel = doc.rss?.channel ?? doc.feed
  if (!channel) throw new Error('Not a podcast feed')
  const items: any[] = channel.item ?? channel.entry ?? []
  const channelImage = channel['itunes:image']?.['@href'] ?? text(channel.image?.url)

  const episodes: FeedEpisode[] = items
    .map((item): FeedEpisode | undefined => {
      const enclosure = item.enclosure
      const atomAudio = Array.isArray(item.link) ? item.link.find((l: any) => l?.['@rel'] === 'enclosure') : undefined
      const audioUrl = enclosure?.['@url'] ?? atomAudio?.['@href']
      if (!audioUrl) return undefined
      const transcripts: FeedTranscriptLink[] = (item['podcast:transcript'] ?? [])
        .filter((t: any) => t?.['@url'])
        .map((t: any) => ({ url: t['@url'], type: t['@type'] ?? '', language: t['@language'] }))
      return {
        guid: text(item.guid) ?? text(item.id) ?? audioUrl,
        title: text(item.title) ?? 'Untitled episode',
        published: isoDate(text(item.pubDate) ?? text(item.published) ?? text(item.updated)),
        durationSec: parseDuration(text(item['itunes:duration'])),
        audioUrl,
        description: text(item['itunes:summary']) ?? text(item.description) ?? text(item.summary),
        image: item['itunes:image']?.['@href'] ?? channelImage,
        transcripts,
      }
    })
    .filter((e): e is FeedEpisode => e !== undefined)

  return {
    title: text(channel.title) ?? 'Untitled podcast',
    author: text(channel['itunes:author']) ?? text(channel.author?.name),
    language: text(channel.language)?.toLowerCase().split('-')[0],
    image: channelImage,
    description: text(channel['itunes:summary']) ?? text(channel.description) ?? text(channel.subtitle),
    episodes,
  }
}

/** Publisher transcripts with timing, best first. Plain text has no timings, so it can't drive subtitles. */
export function pickTimedTranscript(links: FeedTranscriptLink[], language?: string): FeedTranscriptLink | undefined {
  const rank = (t: FeedTranscriptLink) => {
    const type = t.type.toLowerCase()
    if (type.includes('json')) return 0
    if (type.includes('vtt')) return 1
    if (type.includes('srt')) return 2
    return 9
  }
  return links
    .filter((t) => rank(t) < 9 && (!language || !t.language || t.language.toLowerCase().startsWith(language)))
    .sort((a, b) => rank(a) - rank(b))[0]
}

/** Builds a query string without relying on platform URL APIs; undefined values are skipped. */
function query_(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
    .join('&')
}

// ---- Apple Podcasts search and charts ----

export interface PodcastSummary {
  appleId: string
  title: string
  author: string
  artwork: string
  feedUrl?: string
  genres: string[]
}

export function itunesSearchUrl(query: string, country?: string, limit = 25): string {
  return `https://itunes.apple.com/search?${query_({ term: query, media: 'podcast', limit: String(limit), country })}`
}

export function itunesLookupUrl(appleId: string): string {
  return `https://itunes.apple.com/lookup?id=${encodeURIComponent(appleId)}&entity=podcast`
}

export function parseItunesResults(json: any): PodcastSummary[] {
  return (json?.results ?? [])
    .filter((r: any) => r?.collectionId)
    .map((r: any) => ({
      appleId: String(r.collectionId),
      title: r.collectionName ?? r.trackName ?? '',
      author: r.artistName ?? '',
      artwork: r.artworkUrl600 ?? r.artworkUrl100 ?? '',
      feedUrl: r.feedUrl,
      genres: (r.genres ?? []).filter((g: string) => g !== 'Podcasts'),
    }))
}

/** Which country's Apple chart represents each target language (spec: Discovery). */
export const CHART_COUNTRY: Record<string, string> = {
  sv: 'se',
  de: 'de',
  es: 'es',
  fr: 'fr',
  it: 'it',
  pt: 'pt',
  en: 'gb',
}

/**
 * Whose Apple charts feed each language's Top charts shelf. Spanish and Portuguese also draw on
 * Mexico and Brazil, the largest audiences for each. Search still uses CHART_COUNTRY.
 */
export const TOP_CHART_COUNTRIES: Record<string, string[]> = {
  ...Object.fromEntries(Object.entries(CHART_COUNTRY).map(([lang, country]) => [lang, [country]])),
  es: ['es', 'mx'],
  pt: ['pt', 'br'],
}

/** One lookup for many Apple ids (Apple accepts up to about 200 at once). */
export function itunesLookupManyUrl(appleIds: string[]): string {
  return `https://itunes.apple.com/lookup?id=${appleIds.map(encodeURIComponent).join(',')}&entity=podcast`
}

/** Merges several countries' charts by alternating rank, keeping each show once. */
export function interleaveCharts<T extends { appleId: string }>(charts: T[][]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  const longest = Math.max(0, ...charts.map((c) => c.length))
  for (let i = 0; i < longest; i++) {
    for (const chart of charts) {
      const show = chart[i]
      if (show && !seen.has(show.appleId)) {
        seen.add(show.appleId)
        out.push(show)
      }
    }
  }
  return out
}

/**
 * The language a feed declares in its channel's <language> tag, as a two-letter code, read from
 * the start of the feed so a long back catalogue need not be downloaded. Undefined if absent.
 */
export function feedLanguageFromHead(head: string): string | undefined {
  const channelStart = head.search(/<channel[\s>]/i)
  if (channelStart < 0) return undefined
  const firstItem = head.slice(channelStart).search(/<item[\s>]/i)
  const channel = firstItem < 0 ? head.slice(channelStart) : head.slice(channelStart, channelStart + firstItem)
  const m = channel.match(/<language>\s*(?:<!\[CDATA\[)?\s*([A-Za-z]{2,3})(?:[-_][A-Za-z0-9-]+)?\s*(?:\]\]>)?\s*<\/language>/i)
  return m?.[1]?.toLowerCase()
}

export function appleChartUrl(country: string, limit = 50): string {
  return `https://rss.marketingtools.apple.com/api/v2/${country}/podcasts/top/${limit}/podcasts.json`
}

/** Apple's chart feed gives 100px artwork; the same image is served larger by changing the size in the URL. */
export function largerArtwork(url: string, size = 600): string {
  return url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/, `/${size}x${size}bb.$2`)
}

export function parseAppleChart(json: any): PodcastSummary[] {
  return (json?.feed?.results ?? []).map((r: any) => ({
    appleId: String(r.id),
    title: r.name ?? '',
    author: r.artistName ?? '',
    artwork: r.artworkUrl100 ? largerArtwork(r.artworkUrl100) : '',
    genres: (r.genres ?? []).map((g: any) => g.name).filter(Boolean),
  }))
}

// ---- Podcast Index trending (category charts) ----

export interface TrendingPodcast {
  podcastIndexId: number
  title: string
  author: string
  artwork: string
  feedUrl: string
  language?: string
  categories: string[]
}

export function podcastIndexTrendingUrl(language: string, category?: string, max = 50): string {
  return `https://api.podcastindex.org/api/1.0/podcasts/trending?${query_({ lang: language, max: String(max), cat: category })}`
}

export function parsePodcastIndexTrending(json: any): TrendingPodcast[] {
  return (json?.feeds ?? []).map((f: any) => ({
    podcastIndexId: f.id,
    title: f.title ?? '',
    author: f.author ?? '',
    artwork: f.artwork || f.image || '',
    feedUrl: f.url,
    language: f.language?.toLowerCase().split('-')[0],
    categories: Object.values(f.categories ?? {}) as string[],
  }))
}

/** Category charts on the Discover tab, using Podcast Index category names. */
export const DISCOVER_CATEGORIES = ['Comedy', 'News', 'True Crime', 'Society', 'Culture', 'Sports', 'History', 'Science'] as const
