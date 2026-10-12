import { describe, expect, it } from 'vitest'
import {
  appleChartUrl,
  itunesSearchUrl,
  largerArtwork,
  parseAppleChart,
  parseDuration,
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
})

describe('Podcast Index trending', () => {
  it('builds a language and category filtered URL and parses feeds', () => {
    expect(podcastIndexTrendingUrl('sv', 'Comedy', 20)).toBe('https://api.podcastindex.org/api/1.0/podcasts/trending?lang=sv&max=20&cat=Comedy')
    const t = parsePodcastIndexTrending({ feeds: [{ id: 7, title: 'Skämt', author: 'A', artwork: 'i.jpg', url: 'https://f', language: 'sv-SE', categories: { '1': 'Comedy' } }] })
    expect(t[0]).toEqual({ podcastIndexId: 7, title: 'Skämt', author: 'A', artwork: 'i.jpg', feedUrl: 'https://f', language: 'sv', categories: ['Comedy'] })
  })
})
