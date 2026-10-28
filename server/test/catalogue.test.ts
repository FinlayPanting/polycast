import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { forYou, freshVoices, keepShowsInLanguage, syncFeed, topChart } from '../src/catalogue'
import { discoverShelves } from '../src/discover'
import type { Sql } from '../src/db'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip
/** Feed hosts in these tests count as public addresses; internal.example is a private one. */
const NET = { lookupHost: async (h: string) => (h === 'internal.example' ? ['10.0.0.5'] : ['93.184.216.34']) }

const feed = (lang: string | null) =>
  `<?xml version="1.0"?><rss><channel><title>Show</title>${lang ? `<language>${lang}</language>` : ''}<description>&lt;p&gt;A show in ${lang}.&lt;/p&gt;</description><item><title>Ep</title><language>sv</language></item></channel></rss>`

/** Apple charts per country, lookups for any ids, and a feed per show whose language is in its id. */
function fakeApple(charts: Record<string, string[]>, calls: string[] = []): typeof fetch {
  return async (input, init) => {
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
      if (id.startsWith('redir')) {
        // A plain fetch follows the redirect on its own, as Node's does.
        if (init?.redirect !== 'manual') return (calls.push('https://internal.example/sv.xml'), new Response(feed('sv')))
        return new Response(null, { status: 302, headers: { location: 'https://internal.example/sv.xml' } })
      }
      const lang = id.startsWith('none') ? null : id.split('-')[0]!
      return new Response(feed(lang === 'es' ? 'es-MX' : lang))
    }
    if (url.includes('internal.example')) return new Response(feed('sv'))
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

  it('checks feed languages through the safe fetch: a feed redirecting to a private address is never read (PC-1022-01)', async () => {
    const calls: string[] = []
    const shows = [{ appleId: 'redir-1', title: 'Sneaky', author: 'X', artwork: null, genres: [] }, { appleId: 'sv-2', title: 'Fine', author: 'Y', artwork: null, genres: [] }] as any
    const kept = await keepShowsInLanguage(sql, fakeApple({}, calls), shows, 'sv', NET)
    expect(kept.map((s) => s.appleId)).toEqual(['sv-2'])
    expect(calls.some((u) => u.includes('internal.example'))).toBe(false)
    expect(calls).toContain('https://feeds.example.com/redir-1.xml')
  })

  it('finds Fresh voices by exact title in their country and keeps only feeds in the language (PC-1023-05)', async () => {
    const calls: string[] = []
    const byTitle: Record<string, { collectionId: string; collectionName: string }[]> = {
      'STONKS! avec Arthur Perticoz': [{ collectionId: 'fr-71', collectionName: 'Stonks avec Arthur Perticoz' }],
      'Star System': [{ collectionId: 'fr-72', collectionName: 'Star System Academy' }], // not the same show
      'Tunnel par Anna Toumazoff': [{ collectionId: 'en-73', collectionName: 'Tunnel par Anna Toumazoff' }], // feed in English
    }
    const base = fakeApple({}, calls)
    const f: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.includes('itunes.apple.com/search')) {
        calls.push(url)
        const term = new URL(url).searchParams.get('term')!
        return Response.json({ results: (byTitle[term] ?? []).map((r) => ({ ...r, artistName: 'Host', feedUrl: `https://feeds.example.com/${r.collectionId}.xml` })) })
      }
      return base(input, init)
    }
    const shows = await freshVoices(sql, f, 'fr', NET)
    expect(shows.map((s) => s.appleId)).toEqual(['fr-71'])
    expect(shows[0]).toMatchObject({ title: 'Stonks avec Arthur Perticoz', why: 'New voice from France', feedUrl: 'https://feeds.example.com/fr-71.xml' })
    expect(calls.filter((u) => u.includes('/search')).every((u) => new URL(u).searchParams.get('country') === 'fr')).toBe(true)
    // Kept for the day like the charts: no second round of searches.
    const before = calls.length
    expect((await freshVoices(sql, f, 'fr', NET)).map((s) => s.appleId)).toEqual(['fr-71'])
    expect(calls.length).toBe(before)
    // Spotify named no Swedish shows.
    expect(await freshVoices(sql, f, 'sv', NET)).toEqual([])
    const shelves = await discoverShelves(sql, f, 'fr', undefined, [], NET)
    const ids = shelves.map((s) => s.id)
    expect(ids).toContain('fresh')
    expect(shelves.find((s) => s.id === 'fresh')!.title).toBe('Fresh voices')
  })

  it("keeps Swedish shows and drops English ones from Sweden's chart", async () => {
    const top = await topChart(sql, fakeApple({ se: ['sv-1', 'en-2', 'sv-3', 'none-4', 'nofeed-5', 'down-6'] }), 'sv', NET)
    expect(top.map((s) => s.appleId)).toEqual(['sv-1', 'sv-3'])
    expect(top[0]!.feedUrl).toBe('https://feeds.example.com/sv-1.xml')
    expect(top[0]!.artwork).toBe('https://img/600x600bb.jpg')
    // The channel's description comes along from the same read, for mood picks.
    expect(top[0]!.description).toBe('A show in sv.')
  })

  it("merges Spain's and Mexico's charts for Spanish, keeping each show once", async () => {
    const calls: string[] = []
    const top = await topChart(sql, fakeApple({ es: ['es-1', 'en-2', 'es-3'], mx: ['es-9', 'es-1', 'en-8'] }, calls), 'es', NET)
    expect(top.map((s) => s.appleId)).toEqual(['es-1', 'es-9', 'es-3'])
    expect(calls.some((u) => u.includes('/api/v2/mx/'))).toBe(true)
  })

  it("draws on Brazil's chart for Portuguese", async () => {
    const top = await topChart(sql, fakeApple({ pt: ['pt-1'], br: ['pt-2', 'en-3'] }), 'pt', NET)
    expect(top.map((s) => s.appleId)).toEqual(['pt-1', 'pt-2'])
  })

  it('trusts a language already saved for a show instead of fetching its feed', async () => {
    await sql`insert into podcasts (feed_url, title, language) values ('https://feeds.example.com/en-7.xml', 'Known', 'de')`
    const calls: string[] = []
    const top = await topChart(sql, fakeApple({ de: ['en-7', 'de-8'] }, calls), 'de', NET)
    expect(top.map((s) => s.appleId)).toEqual(['en-7', 'de-8'])
    expect(calls).not.toContain('https://feeds.example.com/en-7.xml')
  })

  it('serves the checked chart from the cache for a day', async () => {
    const calls: string[] = []
    const top = await topChart(sql, fakeApple({ se: ['en-1'] }, calls), 'sv', NET)
    expect(top.map((s) => s.appleId)).toEqual(['sv-1', 'sv-3'])
    expect(calls).toEqual([])
  })

  it('has no top chart for a language without a country', async () => {
    expect(await topChart(sql, fakeApple({}), 'xx', NET)).toEqual([])
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
    const shows = await forYou(sql, f, 'sv', ['comedy', 'sport/f1', 'sport/football'], creds, 30, NET)
    // In the order the learner picked: comedy, then sport narrowed to Formula One and football.
    expect(shows.map((s) => s.title)).toEqual(['PI sv-11', 'Show sv-31', 'PI sv-21', 'PI sv-13'])
    expect(shows.map((s) => s.why)).toEqual(['Because you like a laugh', 'Because you follow Formula One', 'Because you follow football', 'Because you like a laugh'])
  })

  it('searches Mexico as well as Spain for Spanish', async () => {
    const calls: string[] = []
    const shows = await forYou(sql, fakeApple({ 'search:es': ['es-41'], 'search:mx': ['es-42', 'en-43'] }, calls), 'es', ['sport/f1'], creds, 30, NET)
    expect(shows.map((s) => s.title)).toEqual(['Show es-41', 'Show es-42'])
  })

  it('is empty with no interests, and Discover then has no For you shelf', async () => {
    expect(await forYou(sql, fakeApple({}), 'sv', [], creds, 30, NET)).toEqual([])
    const shelves = await discoverShelves(sql, fakeApple({ 'pi:Music': ['de-51'] }), 'de', creds, [])
    expect(shelves.map((s) => s.id)).not.toContain('for-you')
  })

  it('leads Discover with For you when the learner picked interests', async () => {
    const shelves = await discoverShelves(sql, fakeApple({ 'pi:Music': ['de-51'], de: ['de-52'] }), 'de', creds, ['music'])
    expect(shelves[0]).toMatchObject({ id: 'for-you', title: 'For you', shows: [{ title: 'PI de-51', why: 'Because you love music' }] })
  })
})

run('Episodes with no ID in video-first feeds (PC-1025-02)', () => {
  let sql: Sql
  let drop: () => Promise<void>
  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
  })
  afterAll(async () => drop?.())

  const FEED = 'https://feeds.example.com/video-first.xml'
  const rss = (item: string) =>
    `<?xml version="1.0"?><rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Vídeo</title><language>es</language><item><title>Uno</title><itunes:duration>600</itunes:duration>${item}</item></channel></rss>`
  const video = `<enclosure url="https://cdn.example.com/uno.mp4" type="video/mp4"/>`
  const withAudio = `${video}<podcast:alternateEnclosure type="audio/mpeg"><podcast:source uri="https://cdn.example.com/uno.mp3"/></podcast:alternateEnclosure>`
  const serving = (xml: string): typeof fetch => async () => new Response(xml)
  const episodes = async (podcastId: string) => sql`select id, guid, audio_url from episodes where podcast_id = ${podcastId}`

  it('adds no second copy when the show adds an audio version, and the learner keeps the episode they had', async () => {
    const { podcastId } = await syncFeed(sql, serving(rss(video)), FEED, undefined, NET)
    const [first] = await episodes(podcastId)
    await syncFeed(sql, serving(rss(withAudio)), FEED, undefined, NET)
    const after = await episodes(podcastId)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: first!.id, guid: 'https://cdn.example.com/uno.mp4', audio_url: 'https://cdn.example.com/uno.mp3' })
  })

  it('gives a copy saved under its audio address since 23 Oct its original ID back, keeping the same episode', async () => {
    const FEED2 = 'https://feeds.example.com/video-first-2.xml'
    const [p] = await sql`insert into podcasts (feed_url, title, language) values (${FEED2}, 'Vídeo 2', 'es') returning id`
    const [saved] = await sql`insert into episodes (podcast_id, guid, title, duration_sec, audio_url, language)
      values (${p!.id}, 'https://cdn.example.com/uno.mp3', 'Uno', 600, 'https://cdn.example.com/uno.mp3', 'es') returning id`
    await syncFeed(sql, serving(rss(withAudio)), FEED2, undefined, NET)
    const after = await episodes(p!.id)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: saved!.id, guid: 'https://cdn.example.com/uno.mp4' })
  })

  it('folds a copy saved under both addresses into the original, keeping every listen, preparation and word (PC-1027-06)', async () => {
    const FEED3 = 'https://feeds.example.com/video-first-3.xml'
    const [p] = await sql`insert into podcasts (feed_url, title, language) values (${FEED3}, 'Vídeo 3', 'es') returning id`
    const [orig] = await sql`insert into episodes (podcast_id, guid, title, duration_sec, audio_url, language)
      values (${p!.id}, 'https://cdn.example.com/uno.mp4', 'Uno', 600, 'https://cdn.example.com/uno.mp4', 'es') returning id`
    const [copy] = await sql`insert into episodes (podcast_id, guid, title, duration_sec, audio_url, language, status, ready_at, difficulty)
      values (${p!.id}, 'https://cdn.example.com/uno.mp3', 'Uno', 612, 'https://cdn.example.com/uno.mp3', 'es', 'ready', now(), ${sql.json({ band: 'easier' })}) returning id`
    const user = async () => {
      const id = randomUUID()
      await sql`insert into auth.users (id) values (${id})`
      return id
    }
    const both = await user()
    const copyOnly = await user()
    await sql`insert into listens (user_id, episode_id, position_sec, guided, started_at, updated_at) values (${both}, ${orig!.id}, 120, false, '2026-10-20T10:00:00Z', '2026-10-20T10:10:00Z')`
    await sql`insert into listens (user_id, episode_id, position_sec, guided, guided_at, started_at, updated_at, finished_at)
      values (${both}, ${copy!.id}, 600, true, '2026-10-25T09:00:00Z', '2026-10-25T09:00:00Z', '2026-10-25T09:20:00Z', '2026-10-25T09:20:00Z')`
    await sql`insert into listens (user_id, episode_id, position_sec, guided) values (${copyOnly}, ${copy!.id}, 42, true)`
    await sql`insert into transcripts (episode_id, language, native_language, source, words, segments) values (${copy!.id}, 'es', 'en', 'scribe', '[]', '[]')`
    await sql`insert into lesson_plans (episode_id, guide_id, plan) values (${copy!.id}, 'mia', '{}')`
    await sql`insert into prep_jobs (episode_id, requested_by, guide_id, charge, status) values (${copy!.id}, ${copyOnly}, 'mia', 'freeEpisode', 'done')`
    await sql`insert into saved_words (user_id, language, lemma, meaning, episode_id, clip, review) values (${copyOnly}, 'es', 'uno', 'one', ${copy!.id}, '{}', '{}')`

    await syncFeed(sql, serving(rss(withAudio)), FEED3, undefined, NET)

    // The prepared copy is the one kept (its guide audio and primer are stored under its id), with the original ID.
    const after = await episodes(p!.id)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: copy!.id, guid: 'https://cdn.example.com/uno.mp4', audio_url: 'https://cdn.example.com/uno.mp3' })
    const kept = copy!.id
    const [ep] = await sql`select status, duration_sec, difficulty from episodes where id = ${kept}`
    expect(ep).toMatchObject({ status: 'ready', duration_sec: 612, difficulty: { band: 'easier' } })
    const listens = await sql`select user_id, position_sec, guided, finished_at is not null as finished, started_at, guided_at from listens where episode_id = ${kept} order by position_sec`
    expect(listens).toHaveLength(2)
    expect(listens[0]).toMatchObject({ user_id: copyOnly, position_sec: 42, guided: true })
    expect(listens[1]).toMatchObject({ user_id: both, position_sec: 600, guided: true, finished: true })
    expect(new Date(listens[1]!.started_at).toISOString()).toBe('2026-10-20T10:00:00.000Z')
    expect(new Date(listens[1]!.guided_at).toISOString()).toBe('2026-10-25T09:00:00.000Z')
    expect((await sql`select 1 from transcripts where episode_id = ${kept}`).length).toBe(1)
    expect((await sql`select 1 from lesson_plans where episode_id = ${kept} and guide_id = 'mia'`).length).toBe(1)
    expect((await sql`select 1 from prep_jobs where episode_id = ${kept}`).length).toBe(1)
    expect((await sql`select episode_id from saved_words where user_id = ${copyOnly}`)[0]!.episode_id).toBe(kept)

    // Syncing again changes nothing.
    await syncFeed(sql, serving(rss(withAudio)), FEED3, undefined, NET)
    expect(await episodes(p!.id)).toHaveLength(1)
  })

  it('keeps the original when neither copy is prepared, and waits while one is being prepared (PC-1027-06)', async () => {
    const FEED4 = 'https://feeds.example.com/video-first-4.xml'
    const [p] = await sql`insert into podcasts (feed_url, title, language) values (${FEED4}, 'Vídeo 4', 'es') returning id`
    const [orig] = await sql`insert into episodes (podcast_id, guid, title, duration_sec, audio_url, language)
      values (${p!.id}, 'https://cdn.example.com/uno.mp4', 'Uno', 600, 'https://cdn.example.com/uno.mp4', 'es') returning id`
    const [copy] = await sql`insert into episodes (podcast_id, guid, title, duration_sec, audio_url, language, status)
      values (${p!.id}, 'https://cdn.example.com/uno.mp3', 'Uno', 600, 'https://cdn.example.com/uno.mp3', 'es', 'preparing') returning id`
    const id = randomUUID()
    await sql`insert into auth.users (id) values (${id})`
    await sql`insert into listens (user_id, episode_id, position_sec) values (${id}, ${copy!.id}, 30)`
    const [job] = await sql`insert into prep_jobs (episode_id, requested_by, guide_id, charge, status) values (${copy!.id}, ${id}, 'mia', 'freeEpisode', 'running') returning id`
    await syncFeed(sql, serving(rss(withAudio)), FEED4, undefined, NET)
    expect(await episodes(p!.id)).toHaveLength(2) // being prepared: left for the next sync

    await sql`update prep_jobs set status = 'failed' where id = ${job!.id}`
    await sql`update episodes set status = 'failed' where id = ${copy!.id}`
    await syncFeed(sql, serving(rss(withAudio)), FEED4, undefined, NET)
    const after = await episodes(p!.id)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: orig!.id, guid: 'https://cdn.example.com/uno.mp4' })
    expect((await sql`select position_sec from listens where user_id = ${id} and episode_id = ${orig!.id}`)[0]!.position_sec).toBe(30)
    expect((await sql`select episode_id from prep_jobs where id = ${job!.id}`)[0]!.episode_id).toBe(orig!.id)
  })
})
