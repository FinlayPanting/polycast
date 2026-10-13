import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { topChart } from '../src/catalogue'
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
