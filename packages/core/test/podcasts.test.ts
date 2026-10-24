import { describe, expect, it } from 'vitest'
import {
  appleChartUrl,
  itunesSearchUrl,
  largerArtwork,
  parseAppleChart,
  chartGenre,
  chartTag,
  parseDuration,
  isVideo,
  parseFeed,
  parseItunesResults,
  parsePodcastIndexTrending,
  pickTimedTranscript,
  podcastIndexTrendingUrl,
} from '../src'

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
<channel>
  <title>Svenska Samtal</title>
  <language>sv-SE</language>
  <itunes:author>Anna &amp; Erik</itunes:author>
  <itunes:image href="https://example.com/show.jpg"/>
  <item>
    <title>Tåget till Göteborg</title>
    <guid isPermaLink="false">ep-42</guid>
    <pubDate>Mon, 05 Oct 2026 06:00:00 GMT</pubDate>
    <itunes:duration>41:07</itunes:duration>
    <enclosure url="https://cdn.example.com/42.mp3" type="audio/mpeg" length="1"/>
    <podcast:transcript url="https://example.com/42.txt" type="text/plain"/>
    <podcast:transcript url="https://example.com/42.vtt" type="text/vtt" language="sv"/>
  </item>
  <item>
    <title>Trailer without audio</title>
  </item>
</channel>
</rss>`

describe('feeds', () => {
  it('reads a podcast feed with its episodes and publisher transcripts', () => {
    const feed = parseFeed(RSS)
    expect(feed.title).toBe('Svenska Samtal')
    expect(feed.language).toBe('sv')
    expect(feed.author).toBe('Anna & Erik')
    expect(feed.episodes).toHaveLength(1)
    const ep = feed.episodes[0]!
    expect(ep).toMatchObject({ guid: 'ep-42', durationSec: 2467, audioUrl: 'https://cdn.example.com/42.mp3', image: 'https://example.com/show.jpg' })
    expect(ep.published).toBe('2026-10-05T06:00:00.000Z')
    expect(pickTimedTranscript(ep.transcripts, 'sv')?.url).toBe('https://example.com/42.vtt')
  })

  it('rejects pages that are not feeds', () => {
    expect(() => parseFeed('<html><body>Captcha</body></html>')).toThrow('Not a podcast feed')
  })

  it('reads durations in every common form', () => {
    expect(parseDuration('1:02:03')).toBe(3723)
    expect(parseDuration('62:03')).toBe(3723)
    expect(parseDuration('3723')).toBe(3723)
    expect(parseDuration('n/a')).toBeUndefined()
  })
})

describe('Apple search and charts', () => {
  it('builds search and chart URLs', () => {
    expect(itunesSearchUrl('svenska podd', 'se')).toBe('https://itunes.apple.com/search?term=svenska%20podd&media=podcast&limit=25&country=se')
    expect(appleChartUrl('se', 10)).toBe('https://rss.marketingtools.apple.com/api/v2/se/podcasts/top/10/podcasts.json')
  })

  it('parses search results and drops the generic "Podcasts" genre', () => {
    const r = parseItunesResults({ results: [{ collectionId: 1, collectionName: 'P3 Dokumentär', artistName: 'Sveriges Radio', artworkUrl600: 'a.jpg', feedUrl: 'f', genres: ['History', 'Podcasts'] }] })
    expect(r).toEqual([{ appleId: '1', title: 'P3 Dokumentär', author: 'Sveriges Radio', artwork: 'a.jpg', feedUrl: 'f', genres: ['History'] }])
  })

  it("parses Apple's chart feed and asks for larger artwork", () => {
    const chart = parseAppleChart({ feed: { results: [{ id: '99', name: 'Rättegångspodden', artistName: 'X', artworkUrl100: 'https://is1.mzstatic.com/a/b/100x100bb.jpg', genres: [{ name: 'Verkliga brott' }] }] } })
    expect(chart[0]).toEqual({ appleId: '99', title: 'Rättegångspodden', author: 'X', artwork: 'https://is1.mzstatic.com/a/b/600x600bb.jpg', genres: ['Verkliga brott'] })
    expect(largerArtwork('https://x/y/100x100.png', 300)).toBe('https://x/y/300x300bb.png')
  })

  it("keeps each show's place in its country's chart, shown as a plain number", () => {
    const chart = parseAppleChart({ feed: { results: [{ id: '1', name: 'Gemischtes Hack', genres: [{ name: 'Comedy' }, { name: 'Podcasts' }] }, { id: '2', name: 'Kaulitz Hills' }] } }, 'de')
    expect(chart.map((s) => s.chart)).toEqual([{ rank: 1, country: 'de' }, { rank: 2, country: 'de' }])
    expect(chartTag(chart[0]!.chart)).toBe('1')
    expect(chartTag({ rank: 3, country: 'gb' })).toBe('3')
    expect(chartTag({ rank: 4, country: 'zz' })).toBe('4')
    expect(chartTag(undefined)).toBeUndefined()
    expect(chartTag({ rank: 0, country: 'de' })).toBeUndefined()
    expect(chartGenre(chart[0]!.genres)).toBe('Comedy')
  })

  it('tags a chart show with its first real genre, never the catch-all "Podcasts"', () => {
    expect(chartGenre(['Podcasts', 'News'])).toBe('News')
    expect(chartGenre(['Sport'])).toBe('Sport')
    expect(chartGenre(['Podcasts'])).toBeUndefined()
    expect(chartGenre([])).toBeUndefined()
    expect(chartGenre(undefined)).toBeUndefined()
  })
})

describe('Podcast Index trending', () => {
  it('builds a language and category filtered URL and parses feeds', () => {
    expect(podcastIndexTrendingUrl('sv', 'Comedy', 20)).toBe('https://api.podcastindex.org/api/1.0/podcasts/trending?lang=sv&max=20&cat=Comedy')
    const t = parsePodcastIndexTrending({ feeds: [{ id: 7, title: 'Skämt', author: 'A', artwork: 'i.jpg', url: 'https://f', language: 'sv-SE', categories: { '1': 'Comedy' } }] })
    expect(t[0]).toEqual({ podcastIndexId: 7, title: 'Skämt', author: 'A', artwork: 'i.jpg', feedUrl: 'https://f', language: 'sv', categories: ['Comedy'] })
  })
})

import { buildSegments, wordsFromPodcastJson } from '../src'
import { wordsFrom } from './fixtures'

describe('subtitle lines', () => {
  it('splits at sentence ends and speaker changes, and breaks up long sentences', () => {
    const a = wordsFrom('Hej och välkommen. Idag pratar vi om tåg', 0, {}, 'A')
    const b = wordsFrom('Ja precis', a.at(-1)!.end + 0.5, {}, 'B')
    const segs = buildSegments([...a, ...b])
    expect(segs.map((s) => s.text)).toEqual(['Hej och välkommen.', 'Idag pratar vi om tåg', 'Ja precis'])
    expect(segs[2]!.speaker).toBe('B')
    const long = buildSegments(wordsFrom('ett två tre fyra fem sex sju åtta nio tio'), { maxWords: 4 })
    expect(long.map((s) => s.wordEnd - s.wordStart)).toEqual([4, 4, 2])
  })
})

describe('publisher JSON transcripts', () => {
  it('uses word-timed files and rejects sentence-level ones', () => {
    const wordLevel = { segments: [{ startTime: 0, endTime: 0.4, body: 'Hej' }, { startTime: 0.5, endTime: 0.9, body: 'där' }] }
    expect(wordsFromPodcastJson(wordLevel)).toHaveLength(2)
    const sentenceLevel = { segments: [{ startTime: 0, endTime: 4, body: 'Hej där, hur mår du?' }] }
    expect(wordsFromPodcastJson(sentenceLevel)).toBeUndefined()
  })
})

describe('Top charts in the target language', () => {
  it('draws Spanish and Portuguese from two countries each, others from one', async () => {
    const { TOP_CHART_COUNTRIES } = await import('../src')
    expect(TOP_CHART_COUNTRIES.es).toEqual(['es', 'mx'])
    expect(TOP_CHART_COUNTRIES.pt).toEqual(['pt', 'br'])
    expect(TOP_CHART_COUNTRIES.sv).toEqual(['se'])
    expect(TOP_CHART_COUNTRIES.fr).toEqual(['fr'])
  })

  it('interleaves charts by rank and keeps each show once', async () => {
    const { interleaveCharts } = await import('../src')
    const s = (id: string) => ({ appleId: id })
    expect(interleaveCharts([[s('a'), s('b'), s('c')], [s('x'), s('a'), s('y'), s('z')]]).map((x) => x.appleId)).toEqual(['a', 'x', 'b', 'c', 'y', 'z'])
    expect(interleaveCharts([])).toEqual([])
  })

  it('builds one lookup for many ids', async () => {
    const { itunesLookupManyUrl } = await import('../src')
    expect(itunesLookupManyUrl(['1', '22'])).toBe('https://itunes.apple.com/lookup?id=1,22&entity=podcast')
  })

  it("reads the channel's language from the start of a feed", async () => {
    const { feedLanguageFromHead } = await import('../src')
    expect(feedLanguageFromHead(RSS)).toBe('sv')
    expect(feedLanguageFromHead('<rss><channel><title>X</title><language><![CDATA[es-MX]]></language>')).toBe('es')
    expect(feedLanguageFromHead('<rss><channel><title>X</title><language> EN </language>')).toBe('en')
    // An episode's own language tag is not the show's.
    expect(feedLanguageFromHead('<rss><channel><title>X</title><item><language>sv</language></item>')).toBeUndefined()
    expect(feedLanguageFromHead('<rss><channel><title>X</title>')).toBeUndefined()
    expect(feedLanguageFromHead('not a feed')).toBeUndefined()
  })
})

describe('video-first feeds play as audio (PC-1023-09)', () => {
  const feedWith = (item: string) =>
    `<?xml version="1.0"?><rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Show</title><language>es</language><item><guid>g</guid><title>Ep</title><itunes:duration>600</itunes:duration>${item}</item></channel></rss>`

  it("takes the feed's audio version when the main file is a video", () => {
    const feed = parseFeed(
      feedWith(`<enclosure url="https://cdn.example.com/ep.mp4" type="video/mp4" length="900000000"/>
        <podcast:alternateEnclosure type="video/mp4" height="1080"><podcast:source uri="https://cdn.example.com/ep-1080.mp4"/></podcast:alternateEnclosure>
        <podcast:alternateEnclosure type="audio/mpeg" length="9000000"><podcast:source uri="https://cdn.example.com/ep.mp3"/></podcast:alternateEnclosure>`),
    )
    expect(feed.episodes[0]!.audioUrl).toBe('https://cdn.example.com/ep.mp3')
  })

  it('prefers the default audio version, and its first web address', () => {
    const feed = parseFeed(
      feedWith(`<enclosure url="https://cdn.example.com/ep.mov" type="video/quicktime"/>
        <podcast:alternateEnclosure type="audio/aac"><podcast:source uri="https://cdn.example.com/ep.aac"/></podcast:alternateEnclosure>
        <podcast:alternateEnclosure type="audio/mpeg" default="true"><podcast:source uri="ipfs://abc"/><podcast:source uri="https://cdn.example.com/ep-default.mp3"/></podcast:alternateEnclosure>`),
    )
    expect(feed.episodes[0]!.audioUrl).toBe('https://cdn.example.com/ep-default.mp3')
  })

  it('keeps an audio enclosure as it is, and a video-only episode as its video', () => {
    expect(parseFeed(feedWith(`<enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg"/><podcast:alternateEnclosure type="audio/aac"><podcast:source uri="https://cdn.example.com/ep.aac"/></podcast:alternateEnclosure>`)).episodes[0]!.audioUrl).toBe('https://cdn.example.com/ep.mp3')
    expect(parseFeed(feedWith(`<enclosure url="https://cdn.example.com/ep.mp4" type="video/mp4"/>`)).episodes[0]!.audioUrl).toBe('https://cdn.example.com/ep.mp4')
  })

  it('tells video from audio by type, then by extension', () => {
    expect(isVideo('https://x/ep.mp4', 'video/mp4')).toBe(true)
    expect(isVideo('https://x/ep.mp4', 'audio/mp4')).toBe(false)
    expect(isVideo('https://x/ep.mp3?token=a.mp4')).toBe(false)
    expect(isVideo('https://x/ep.MP4?dl=1')).toBe(true)
    expect(isVideo('https://x/ep.m4a')).toBe(false)
    expect(isVideo('https://x/ep.mp3', 'application/octet-stream')).toBe(false)
  })
})
