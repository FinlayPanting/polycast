import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { forYou, topChart } from '../src/catalogue'
import { discoverShelves } from '../src/discover'
import type { Sql } from '../src/db'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip

const feed = (lang: string | null) =>
  `<?xml version="1.0"?><rss><channel><title>Show</title>${lang ? `<language>${lang}</language>` : ''}<item><title>Ep</title><language>sv</language></item></channel></rss>`

/** Apple charts per country, lookups for any ids, and a feed per show whose language is in its id. */
function fakeApple(charts: Record<string, string[]>, calls: string[] = []): typeof fetch {
  return async (input) => {
    const url = String(input)
    calls.push(url)
    const chart = url.match(/marketingtools\.apple\.com\/api\/v2\/(\w+)\//)
    if (chart) return Response.json({ feed: { results: (charts[chart[1]!] ?? []).map((id) => ({ id, name: `Show ${id}`, artistName: 'Host', artworkUrl100: 'https://img/100x100bb.jpg', genres: [] })) } })
    if (url.includes('itunes.apple.com/lookup')) {
      const ids = new URL(url).searchParams.get('id')!.split(',')
      return Response.json({ results: ids.filter((id) => !id.startsWith('nofeed')).map((id) => ({ collectionId: id, collectionName: `Show ${id}`, feedUrl: `https://feeds.example.com/${id}.xml` })) })
    }
    if (url.includes('itunes.apple.com/search')) {
      const country = new URL(url).searchParams.get('country')!
      return Response.json({ results: (charts[`search:${country}`] ?? []).map((id) => ({ collectionId: id, collectionName: `Show ${id}`, feedUrl: `https://feeds.example.com/${id}.xml` })) })
    }
    if (url.includes('api.podcastindex.org')) {
      const cat = new URL(url).searchParams.get('cat')!
      return Response.json({ feeds: (charts[`pi:${cat}`] ?? []).map((id) => ({ id: Number(id.split('-')[1]), title: `PI ${id}`, url: `https://feeds.example.com/${id}.xml`, language: id.split('-')[0], categories: {} })) })
    }
    const f = url.match(/feeds\.example\.com\/(.+)\.xml/)
    if (f) {
      const id = f[1]!
      if (id.startsWith('down')) return new Response('gone', { status: 500 })
      const lang = id.startsWith('none') ? null : id.split('-')[0]!
      return new Response(feed(lang === 'es' ? 'es-MX' : lang))
    }
    return new Response('not found', { status: 404 })
  }
}

run('Top charts only show the target language', () => {
  let sql: Sql
  let drop: () => Promise<void>
  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
  })
  afterAll(async () => drop?.())

  it("keeps Swedish shows and drops English ones from Sweden's chart", async () => {
    const top = await topChart(sql, fakeApple({ se: ['sv-1', 'en-2', 'sv-3', 'none-4', 'nofeed-5', 'down-6'] }), 'sv')
    expect(top.map((s) => s.appleId)).toEqual(['sv-1', 'sv-3'])
    expect(top[0]!.feedUrl).toBe('https://feeds.example.com/sv-1.xml')
    expect(top[0]!.artwork).toBe('https://img/600x600bb.jpg')
  })

  it("merges Spain's and Mexico's charts for Spanish, keeping each show once", async () => {
    const calls: string[] = []
    const top = await topChart(sql, fakeApple({ es: ['es-1', 'en-2', 'es-3'], mx: ['es-9', 'es-1', 'en-8'] }, calls), 'es')
    expect(top.map((s) => s.appleId)).toEqual(['es-1', 'es-9', 'es-3'])
    expect(calls.some((u) => u.includes('/api/v2/mx/'))).toBe(true)
  })

  it("draws on Brazil's chart for Portuguese", async () => {
    const top = await topChart(sql, fakeApple({ pt: ['pt-1'], br: ['pt-2', 'en-3'] }), 'pt')
    expect(top.map((s) => s.appleId)).toEqual(['pt-1', 'pt-2'])
  })

  it('trusts a language already saved for a show instead of fetching its feed', async () => {
    await sql`insert into podcasts (feed_url, title, language) values ('https://feeds.example.com/en-7.xml', 'Known', 'de')`
    const calls: string[] = []
    const top = await topChart(sql, fakeApple({ de: ['en-7', 'de-8'] }, calls), 'de')
    expect(top.map((s) => s.appleId)).toEqual(['en-7', 'de-8'])
    expect(calls).not.toContain('https://feeds.example.com/en-7.xml')
  })

  it('serves the checked chart from the cache for a day', async () => {
    const calls: string[] = []
    const top = await topChart(sql, fakeApple({ se: ['en-1'] }, calls), 'sv')
    expect(top.map((s) => s.appleId)).toEqual(['sv-1', 'sv-3'])
    expect(calls).toEqual([])
  })

  it('has no top chart for a language without a country', async () => {
    expect(await topChart(sql, fakeApple({}), 'xx')).toEqual([])
  })
})

run('For you shelf from a learner\'s interests', () => {
  let sql: Sql
  let drop: () => Promise<void>
  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
  })
  afterAll(async () => drop?.())
  const creds = { key: 'k', secret: 's' }

  it('mixes category shows and searched shows in the language, each with why it is there', async () => {
    const f = fakeApple({
      'pi:Comedy': ['sv-11', 'en-12', 'sv-13'],
      'pi:Soccer': ['sv-21'],
      'search:se': ['sv-31', 'en-32'],
    })
    const shows = await forYou(sql, f, 'sv', ['comedy', 'sport/f1', 'sport/football'], creds)
    // In the order the learner picked: comedy, then sport narrowed to Formula One and football.
    expect(shows.map((s) => s.title)).toEqual(['PI sv-11', 'Show sv-31', 'PI sv-21', 'PI sv-13'])
    expect(shows.map((s) => s.why)).toEqual(['Because you like a laugh', 'Because you follow Formula One', 'Because you follow football', 'Because you like a laugh'])
  })

  it('searches Mexico as well as Spain for Spanish', async () => {
    const calls: string[] = []
    const shows = await forYou(sql, fakeApple({ 'search:es': ['es-41'], 'search:mx': ['es-42', 'en-43'] }, calls), 'es', ['sport/f1'], creds)
    expect(shows.map((s) => s.title)).toEqual(['Show es-41', 'Show es-42'])
  })

  it('is empty with no interests, and Discover then has no For you shelf', async () => {
    expect(await forYou(sql, fakeApple({}), 'sv', [], creds)).toEqual([])
    const shelves = await discoverShelves(sql, fakeApple({ 'pi:Music': ['de-51'] }), 'de', creds, [])
    expect(shelves.map((s) => s.id)).not.toContain('for-you')
  })

  it('leads Discover with For you when the learner picked interests', async () => {
    const shelves = await discoverShelves(sql, fakeApple({ 'pi:Music': ['de-51'], de: ['de-52'] }), 'de', creds, ['music'])
    expect(shelves[0]).toMatchObject({ id: 'for-you', title: 'For you', shows: [{ title: 'PI de-51', why: 'Because you love music' }] })
  })
})
