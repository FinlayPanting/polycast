import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi, LEARNER_LIMITS, MOOD_LIMITS, MOOD_MESSAGES, SLOW_DOWN } from '../src/api'
import { runJob, showNamesFor, type WorkerDeps } from '../src/worker'
import { ProviderError, type TextModel } from '../src/providers/types'
import { OWN_KEYS_LIMITS } from '../src/ownKeys'
import { claimNextJob, queueSyncUpgrades, type Sql } from '../src/db'
import { memoryStorage, mockSpeech, mockText, mockTranscriber } from '../src/providers/mock'
import { memoryLedger, SpendGuard } from '../src/budget'
import { draftFor, syntheticEpisode } from './fixtures'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip

const FEED_URL = 'https://feeds.example.com/svenska.xml'
const RSS = `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
  <title>Svenska Samtal</title><language>sv</language><itunes:author>Anna</itunes:author><description><![CDATA[<p>Vardagssvenska, <b>lugnt</b> och roligt.</p>]]></description>
  <item><title>Tåget</title><guid>ep-1</guid><pubDate>Mon, 05 Oct 2026 06:00:00 GMT</pubDate><itunes:duration>590</itunes:duration><enclosure url="https://cdn.example.com/1.mp3" type="audio/mpeg"/></item>
  <item><title>Fikan</title><guid>ep-2</guid><pubDate>Mon, 28 Sep 2026 06:00:00 GMT</pubDate><itunes:duration>590</itunes:duration><enclosure url="https://cdn.example.com/2.mp3" type="audio/mpeg"/></item>
</channel></rss>`

/** Serves the feed, Apple lookups and an empty chart; anything else is a 404. */
const fakeFetch: typeof fetch = async (input) => {
  const url = String(input)
  if (url === FEED_URL) return new Response(RSS)
  if (url.includes('itunes.apple.com/lookup')) return Response.json({ results: [{ collectionId: 555, collectionName: 'Svenska Samtal', artistName: 'Anna', feedUrl: FEED_URL, artworkUrl600: 'https://img/a.jpg', genres: [] }] })
  if (url.includes('marketingtools.apple.com')) return Response.json({ feed: { results: [{ id: '555', name: 'Svenska Samtal', artistName: 'Anna', artworkUrl100: 'https://img/100x100bb.jpg', genres: [] }] } })
  return new Response('not found', { status: 404 })
}

/** Every test host resolves to a public address. */
const publicHost = async () => ['93.184.216.34']

run('API and worker', () => {
  let sql: Sql
  let drop: () => Promise<void>
  const alerts: string[] = []

  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
  })
  afterAll(async () => drop?.())

  /** The token is just the user id here; production verifies a Supabase token. */
  const api = () =>
    createApi({ sql, verify: async (t) => (t.startsWith('bad') ? undefined : t), fetch: fakeFetch, lookupHost: publicHost, alert: async (k, m) => void alerts.push(`${k}: ${m}`) })

  async function learner(): Promise<string> {
    const id = randomUUID()
    await sql`insert into auth.users (id) values (${id})`
    return id
  }

  const call = (userId: string, method: string, path: string, body?: unknown) =>
    api().request(path, { method, headers: { Authorization: `Bearer ${userId}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  const worker = () => {
    const ep = syntheticEpisode()
    return {
      sql,
      fetch: fakeFetch,
      lookupHost: publicHost,
      transcriber: mockTranscriber(ep.words),
      text: mockText((req) =>
        req.prompt.includes('Translate these lines')
          ? { lines: [...req.prompt.matchAll(/^(s\d+): /gm)].map((m) => ({ id: m[1], translation: 'EN' })) }
          : req.prompt.startsWith('form | example')
            ? { entries: [] }
            : draftFor(),
      ),
      speech: mockSpeech(),
      storage: memoryStorage(),
      notifyReady: async (userId: string, title: string) => void alerts.push(`ready: ${title} for ${userId}`),
    }
  }

  it('turns away requests without a valid sign-in', async () => {
    const res = await api().request('/v1/discover/sv', { headers: { Authorization: 'Bearer bad' } })
    expect(res.status).toBe(401)
  })

  it('takes a learner from opening a show to hearing a guided episode', async () => {
    const anna = await learner()

    const opened = await (await call(anna, 'POST', '/v1/podcasts/open', { appleId: '555' })).json()
    expect(opened.podcast.title).toBe('Svenska Samtal')
    expect(opened.episodes.map((e: any) => e.title)).toEqual(['Tåget', 'Fikan'])
    const episodeId = opened.episodes[0].id

    // Not ready yet: the player refuses, the prepare call queues it on her free episode.
    expect((await call(anna, 'POST', `/v1/episodes/${episodeId}/listen`)).status).toBe(409)
    const prep = await (await call(anna, 'POST', `/v1/episodes/${episodeId}/prepare`)).json()
    expect(prep).toMatchObject({ status: 'queued', charge: 'freeEpisode' })

    const job = (await claimNextJob(sql))!
    expect(await runJob(worker(), job)).toBe('done')
    expect(alerts).toContain(`ready: Tåget for ${anna}`)
    expect(await (await call(anna, 'GET', `/v1/jobs/${prep.jobId}`)).json()).toMatchObject({ status: 'done', stage: 'done' })

    // The primer is there for the episode screen, without starting anything (PC-1017-P4).
    const { primer } = await (await call(anna, 'GET', `/v1/episodes/${episodeId}/primer`)).json()
    expect(primer.words.length).toBeGreaterThanOrEqual(3)
    expect(primer.gist).toBeTruthy()
    expect((await call(anna, 'GET', `/v1/episodes/00000000-0000-0000-0000-000000000000/primer`)).status).toBe(404)

    // Saving the lesson to her phone ahead of time doesn't count as starting it.
    const lesson = await (await call(anna, 'POST', `/v1/episodes/${episodeId}/lesson`)).json()
    expect(lesson.guided).toBe(true)
    expect(lesson.plan.moments.length).toBeGreaterThan(5)
    expect((await sql`select count(*)::int as n from listens where episode_id = ${episodeId}`)[0]!.n).toBe(0)

    const listen = await (await call(anna, 'POST', `/v1/episodes/${episodeId}/listen`)).json()
    expect(listen.guided).toBe(true)
    expect(listen.guidanceLevel).toBe('standard')
    // The intensity chosen for this episode wins over her default; nonsense falls back to it (PC-1017-F13).
    expect((await (await call(anna, 'POST', `/v1/episodes/${episodeId}/lesson`, { level: 'handsOn' })).json()).guidanceLevel).toBe('handsOn')
    expect((await (await call(anna, 'POST', `/v1/episodes/${episodeId}/lesson`, { level: 'loud' })).json()).guidanceLevel).toBe('standard')
    expect(listen.episode.audioUrl).toBe('https://cdn.example.com/1.mp3')
    expect(listen.transcript.segments.length).toBeGreaterThan(10)
    expect(listen.plan.moments.length).toBeGreaterThan(5)
    // It was her free episode, so its wrap-up can mention Plus; once she has Plus, it doesn't.
    expect(listen.freeEpisode).toBe(true)
    await sql`update profiles set plan = 'plus' where id = ${anna}`
    expect((await (await call(anna, 'POST', `/v1/episodes/${episodeId}/lesson`)).json()).freeEpisode).toBe(false)
    await sql`update profiles set plan = 'free' where id = ${anna}`
  })

  it('refuses to load a show from a private address, without fetching it', async () => {
    const fetched: string[] = []
    const spy: typeof fetch = async (input, init) => (fetched.push(String(input)), fakeFetch(input, init))
    const guarded = createApi({ sql, verify: async (t) => t, fetch: spy, lookupHost: async (h) => (h === 'internal.example' ? ['10.0.0.5'] : ['93.184.216.34']) })
    const user = await learner()
    for (const feedUrl of ['http://169.254.169.254/latest/meta-data', 'https://internal.example/feed.xml', 'http://[fd12::1]:8080/', 'file:///etc/passwd']) {
      const res = await guarded.request('/v1/podcasts/open', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ feedUrl }) })
      expect(res.status).toBe(502)
    }
    expect(fetched).toEqual([])
  })

  it('serves a ready episode free to the next learner, and explains refusals in plain English', async () => {
    const erik = await learner()
    const opened = await (await call(erik, 'POST', '/v1/podcasts/open', { feedUrl: FEED_URL })).json()
    const ready = opened.episodes.find((e: any) => e.status === 'ready')
    expect(await (await call(erik, 'POST', `/v1/episodes/${ready.id}/prepare`)).json()).toEqual({ status: 'ready' })
    // Someone else's free episode isn't his.
    expect((await (await call(erik, 'POST', `/v1/episodes/${ready.id}/lesson`)).json()).freeEpisode).toBe(false)

    // Erik uses his free episode on the other one; a third request is refused with a reason.
    const other = opened.episodes.find((e: any) => e.status !== 'ready')
    expect((await (await call(erik, 'POST', `/v1/episodes/${other.id}/prepare`)).json()).charge).toBe('freeEpisode')
    await sql`update episodes set status = 'none' where id = ${other.id}`
    await sql`update prep_jobs set status = 'failed' where episode_id = ${other.id}`
    const refused = await call(erik, 'POST', `/v1/episodes/${other.id}/prepare`)
    expect(refused.status).toBe(402)
    expect((await refused.json()).message).toMatch(/used your free episode/)
  })

  it('gathers a show’s title, hosts and recurring names for the transcriber', async () => {
    const [p] = await sql`select id from podcasts where feed_url = ${FEED_URL}`
    await sql`update podcasts set author = 'Anna och Erik' where id = ${p!.id}`
    await sql`insert into episodes (podcast_id, guid, title, audio_url, duration_sec, language) values
      (${p!.id}, 'n1', 'Fika med Lotta i Malmö', 'https://cdn.example.com/n1.mp3', 60, 'sv'),
      (${p!.id}, 'n2', 'Ute med Lotta i Malmö', 'https://cdn.example.com/n2.mp3', 60, 'sv')`
    expect(await showNamesFor(sql, p!.id)).toEqual({ showTitle: 'Svenska Samtal', hosts: ['Anna', 'Erik'], names: ['Lotta', 'Malmö'] })
    await sql`delete from episodes where guid in ('n1', 'n2')`
    await sql`update podcasts set author = 'Anna' where id = ${p!.id}`
  })

  it('shows Polycast picks, easy listening and the top chart on Discover', async () => {
    const someone = await learner()
    const [p] = await sql`select id from podcasts limit 1`
    await sql`insert into picks (language, podcast_id, position) values ('sv', ${p!.id}, 1)`
    await sql`update episodes set difficulty = '{"band":"easier","label":"A2–B1, relaxed pace","wpm":120}' where status = 'ready'`
    const { shelves } = await (await call(someone, 'GET', '/v1/discover/sv')).json()
    expect(shelves.map((s: any) => s.id)).toEqual(['picks', 'easy', 'top', 'favourites'])
    expect(shelves[0].shows[0]).toMatchObject({ title: 'Svenska Samtal', readyEpisodes: 1 })
    expect(shelves[2].shows[0].artwork).toBe('https://img/600x600bb.jpg')
    expect(shelves[2].shows[0].chart).toEqual({ rank: 1, country: 'se' })
  })

  it('reads the learner\'s saved interests for Discover', async () => {
    const someone = await learner()
    await sql`update profiles set interests = '{comedy}' where id = ${someone}`
    const { shelves } = await (await call(someone, 'GET', '/v1/discover/sv')).json()
    // No Podcast Index key in this test, so the For you shelf is empty and left out; the request still works.
    expect(shelves.map((s: any) => s.id)).toContain('top')
  })

  it('switches a learner to Plus and back when RevenueCat says so', async () => {
    const lea = await learner()
    const hook = (type: string) =>
      createApi({ sql, verify: async () => undefined, fetch: fakeFetch, revenueCatSecret: 's3cret' }).request('/webhooks/revenuecat', {
        method: 'POST',
        headers: { Authorization: 'Bearer s3cret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: { type, app_user_id: lea } }),
      })
    await hook('INITIAL_PURCHASE')
    expect((await sql`select plan from profiles where id = ${lea}`)[0]!.plan).toBe('plus')
    await hook('EXPIRATION')
    expect((await sql`select plan from profiles where id = ${lea}`)[0]!.plan).toBe('free')
    const forged = await createApi({ sql, verify: async () => undefined, fetch: fakeFetch, revenueCatSecret: 's3cret' }).request('/webhooks/revenuecat', {
      method: 'POST',
      body: JSON.stringify({ event: { type: 'INITIAL_PURCHASE', app_user_id: lea } }),
    })
    expect(forged.status).toBe(401)
  })

  it('deletes a learner’s account and their words and listens, but keeps the shared catalogue', async () => {
    const gone = await learner()
    const [ep] = await sql`select id from episodes where status = 'ready' limit 1`
    await sql`insert into saved_words (user_id, language, lemma, meaning, clip, review) values (${gone}, 'sv', 'fika', 'coffee break', '{}', '{}')`
    await sql`insert into listens (user_id, episode_id) values (${gone}, ${ep!.id})`
    expect((await call(gone, 'DELETE', '/v1/account')).status).toBe(200)
    expect(await sql`select 1 from profiles where id = ${gone}`).toHaveLength(0)
    expect(await sql`select 1 from saved_words where user_id = ${gone}`).toHaveLength(0)
    expect(await sql`select 1 from episodes where id = ${ep!.id}`).toHaveLength(1)
  })

  it('serves prepared lessons as readable pages, only with the admin token', async () => {
    const admin = createApi({ sql, verify: async () => undefined, fetch: fakeFetch, funnelToken: 't0ken' })
    expect((await admin.request('/admin/lessons')).status).toBe(401)
    expect((await admin.request('/admin/lessons?token=wrong')).status).toBe(401)
    const { lessons } = await (await admin.request('/admin/lessons?token=t0ken')).json()
    const tåget = lessons.find((l: any) => l.title === 'Tåget')
    expect(tåget).toMatchObject({ podcast_title: 'Svenska Samtal', plans: 1 })
    const page = await admin.request(`/admin/lessons/${tåget.id}`, { headers: { Authorization: 'Bearer t0ken' } })
    expect(page.status).toBe(200)
    expect(page.headers.get('Content-Type')).toContain('text/markdown')
    const text = await page.text()
    expect(text).toContain('# Svenska Samtal: Tåget')
    expect(text).toContain('## Moments')
    expect(text).toContain('**Guide:**')
    expect((await admin.request(`/admin/lessons/${randomUUID()}?token=t0ken`)).status).toBe(404)
    expect((await admin.request('/admin/lessons/not-an-id?token=t0ken')).status).toBe(404)
  })

  it('accepts a creator’s removal request without an account, and alerts Finlay', async () => {
    const res = await api().request('/removal-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ podcastTitle: 'Svenska Samtal', contact: 'anna@example.com' }) })
    expect(res.status).toBe(200)
    expect(alerts.some((a) => a.startsWith('removal:'))).toBe(true)
  })

  it('caps the removal form’s fields and how often one address can send it', async () => {
    const before = alerts.filter((a) => a.startsWith('removal:')).length
    const form = api()
    const send = (body: unknown, ip = '203.0.113.7') =>
      form.request('/removal-requests', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip }, body: JSON.stringify(body) })
    expect((await send({ podcastTitle: 'x'.repeat(201), contact: 'a@b.c' })).status).toBe(400)
    expect((await send({ podcastTitle: 'Show', contact: 'a@b.c', message: 'x'.repeat(2001) })).status).toBe(400)
    expect((await send({ podcastTitle: { $gt: '' }, contact: 'a@b.c' })).status).toBe(400)
    for (let i = 0; i < 5; i++) expect((await send({ podcastTitle: 'Show', contact: 'a@b.c' })).status).toBe(200)
    const limited = await send({ podcastTitle: 'Show', contact: 'a@b.c' })
    expect(limited.status).toBe(429)
    expect((await limited.json()).error).toMatch(/try again in an hour/)
    // Someone else can still reach Finlay.
    expect((await send({ podcastTitle: 'Show', contact: 'c@d.e' }, '198.51.100.9')).status).toBe(200)
    expect(alerts.filter((a) => a.startsWith('removal:')).length - before).toBe(6)
  })

  it('keeps each learner to a fair pace on search, show pages and preparing', async () => {
    const seen: string[] = []
    const counting: typeof fetch = async (input, init) => {
      seen.push(String(input))
      if (String(input).includes('itunes.apple.com/search')) return Response.json({ results: [] })
      return fakeFetch(input, init)
    }
    const limited = createApi({ sql, verify: async (t) => t, fetch: counting, lookupHost: publicHost })
    const ask = (userId: string, path: string, method = 'GET', body?: unknown) =>
      limited.request(path, { method, headers: { Authorization: `Bearer ${userId}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const ola = await learner()
    const kim = await learner()
    for (let i = 0; i < LEARNER_LIMITS.searchPerMinute; i++) expect((await ask(ola, '/v1/search?q=fika&language=sv')).status).toBe(200)
    const slow = await ask(ola, '/v1/search?q=fika&language=sv')
    expect(slow.status).toBe(429)
    expect((await slow.json()).error).toBe(SLOW_DOWN)
    // Another learner isn't held up.
    expect((await ask(kim, '/v1/search?q=fika&language=sv')).status).toBe(200)
    // A very long search is cut to a sensible length before it reaches anyone else.
    seen.length = 0
    await ask(kim, `/v1/search?q=${'a'.repeat(5000)}&language=sv`)
    expect(seen.length).toBeGreaterThan(0)
    for (const url of seen) expect(url).not.toContain('a'.repeat(LEARNER_LIMITS.searchMaxChars + 1))

    for (let i = 0; i < LEARNER_LIMITS.openPerMinute; i++) expect((await ask(kim, '/v1/podcasts/open', 'POST', { feedUrl: FEED_URL })).status).not.toBe(429)
    expect((await ask(kim, '/v1/podcasts/open', 'POST', { feedUrl: FEED_URL })).status).toBe(429)

    const ep = (await sql`select e.id from episodes e join podcasts p on p.id = e.podcast_id where p.feed_url = ${FEED_URL} limit 1`)[0]!.id
    for (let i = 0; i < LEARNER_LIMITS.preparePerMinute; i++) expect((await ask(ola, `/v1/episodes/${ep}/prepare`, 'POST')).status).not.toBe(429)
    expect((await ask(ola, `/v1/episodes/${ep}/prepare`, 'POST')).status).toBe(429)
  })

  it('moves Plus to the account signed in now when a learner restores purchases', async () => {
    const oldAccount = await learner()
    const newAccount = await learner()
    const hook = (event: Record<string, unknown>) =>
      createApi({ sql, verify: async () => undefined, fetch: fakeFetch, revenueCatSecret: 's3cret' }).request('/webhooks/revenuecat', {
        method: 'POST',
        headers: { Authorization: 'Bearer s3cret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      })
    const profile = async (id: string) => (await sql`select plan, plus_used_sec, plus_period_start from profiles where id = ${id}`)[0]!
    await hook({ type: 'INITIAL_PURCHASE', app_user_id: oldAccount, purchased_at_ms: Date.parse('2026-10-03T09:00:00Z') })
    await sql`update profiles set plus_used_sec = 2400 where id = ${oldAccount}`

    // RevenueCat's TRANSFER carries no app_user_id, only who it moved from and to.
    const res = await hook({ type: 'TRANSFER', transferred_from: [oldAccount], transferred_to: [newAccount] })
    expect(res.status).toBe(200)
    expect(await profile(newAccount)).toMatchObject({ plan: 'plus', plus_used_sec: 2400 })
    expect((await profile(newAccount)).plus_period_start.toISOString()).toBe('2026-10-03T09:00:00.000Z')
    expect((await profile(oldAccount)).plan).toBe('free')

    // From an anonymous RevenueCat id (not one of our accounts): Plus still arrives.
    const third = await learner()
    await hook({ type: 'TRANSFER', transferred_from: ['$RCAnonymousID:abc123'], transferred_to: [third] })
    expect((await profile(third)).plan).toBe('plus')
    expect((await profile(third)).plus_used_sec).toBe(0)
    // Malformed transfers change nothing.
    expect((await hook({ type: 'TRANSFER', transferred_from: [third] })).status).toBe(200)
    expect((await profile(third)).plan).toBe('plus')
  })

  it('gives a fresh 5 Plus hours once per paid month, however often RevenueCat repeats an event', async () => {
    const max = await learner()
    const hook = (event: Record<string, unknown>) =>
      createApi({ sql, verify: async () => undefined, fetch: fakeFetch, revenueCatSecret: 's3cret' }).request('/webhooks/revenuecat', {
        method: 'POST',
        headers: { Authorization: 'Bearer s3cret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: { app_user_id: max, ...event } }),
      })
    const used = async () => (await sql`select plus_used_sec, plus_period_start from profiles where id = ${max}`)[0]!
    const sept = Date.parse('2026-09-01T10:00:00Z')
    const oct = Date.parse('2026-10-01T10:00:00Z')

    await hook({ type: 'INITIAL_PURCHASE', id: 'e1', purchased_at_ms: sept })
    expect((await used()).plus_period_start.toISOString()).toBe('2026-09-01T10:00:00.000Z')
    await sql`update profiles set plus_used_sec = 3600 where id = ${max}`
    // The same purchase delivered again: hours stay used.
    await hook({ type: 'INITIAL_PURCHASE', id: 'e1', purchased_at_ms: sept })
    expect((await used()).plus_used_sec).toBe(3600)

    await hook({ type: 'RENEWAL', id: 'e2', purchased_at_ms: oct })
    expect(await used()).toMatchObject({ plus_used_sec: 0 })
    await sql`update profiles set plus_used_sec = 1800 where id = ${max}`
    await hook({ type: 'RENEWAL', id: 'e2', purchased_at_ms: oct })
    await hook({ type: 'RENEWAL', id: 'e2-late-copy', purchased_at_ms: sept })
    // An event without a purchase time can't reset a month that's still running.
    await hook({ type: 'RENEWAL', id: 'e3' })
    expect((await used()).plus_used_sec).toBe(1800)
    expect((await used()).plus_period_start.toISOString()).toBe('2026-10-01T10:00:00.000Z')
  })

  it("sends Polycast's own re-preparations through the batch service quietly, and never a learner's request", async () => {
    const ben = await learner()
    const opened = await (await call(ben, 'POST', '/v1/podcasts/open', { appleId: '555' })).json()
    const episodeId = opened.episodes[1].id
    await call(ben, 'POST', `/v1/episodes/${episodeId}/prepare`)
    let batchCalls = 0
    const w = worker()
    const counted: TextModel = { generateJson: <T,>(i: Parameters<TextModel['generateJson']>[0]) => (batchCalls++, w.text.generateJson<T>(i)) }
    const withBatch: WorkerDeps = { ...w, batchText: () => counted }
    expect(await runJob(withBatch, (await claimNextJob(sql, 'learners'))!)).toBe('done')
    expect(batchCalls).toBe(0)
    expect(alerts.filter((a) => a === `ready: Fikan for ${ben}`)).toHaveLength(1)
    const [first] = await sql`select ready_at from episodes where id = ${episodeId}`

    // An older episode without a fingerprint is prepared again at Polycast's cost.
    await sql`update lesson_plans set plan = plan - 'syncUrl' where episode_id = ${episodeId}`
    expect(await queueSyncUpgrades(sql)).toBeGreaterThanOrEqual(1)
    const replan = (await claimNextJob(sql, 'background'))!
    expect(replan.episodeId).toBe(episodeId)
    expect(await runJob(withBatch, replan)).toBe('done')
    expect(batchCalls).toBeGreaterThan(0)
    // Nobody is told 'Your episode is ready' again, and it doesn't jump up 'recently ready'.
    expect(alerts.filter((a) => a.startsWith('ready: Fikan'))).toHaveLength(1)
    const [after] = await sql`select ready_at from episodes where id = ${episodeId}`
    expect(after!.ready_at.getTime()).toBe(first!.ready_at.getTime())
  })

  it("answers 'what are you in the mood for' with three picks from the pool, cached and counted", async () => {
    const someone = await learner()
    const [show] = await sql`select id, description from podcasts where feed_url = ${FEED_URL}`
    // The feed's own description is kept, cleaned of HTML.
    expect(show!.description).toBe('Vardagssvenska, lugnt och roligt.')
    let calls = 0
    const prompts: string[] = []
    const text: TextModel = {
      async generateJson<T>(i: Parameters<TextModel['generateJson']>[0]) {
        calls++
        prompts.push(i.prompt)
        const ids = [...i.prompt.matchAll(/^((?:show|episode):\S+) \|/gm)].map((m) => m[1]!)
        return { data: { picks: [...ids.slice(0, 3).map((id) => ({ id, why: 'Easy, warm chat to start with!' })), { id: 'show:made-up', why: 'x' }] } as T, usage: { textInTokens: 2000, textOutTokens: 100 } }
      },
    }
    const ledger = memoryLedger()
    const app = createApi({ sql, verify: async (t) => t, fetch: fakeFetch, lookupHost: publicHost, text, guard: new SpendGuard(ledger, 5) })
    const ask = (mood: unknown, who = someone) =>
      app.request('/v1/discover/sv/mood', { method: 'POST', headers: { Authorization: `Bearer ${who}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mood }) })

    const first = await ask('Something calm about everyday Swedish')
    expect(first.status).toBe(200)
    const { picks } = await first.json()
    expect(picks.length).toBeGreaterThanOrEqual(1)
    expect(picks.length).toBeLessThanOrEqual(3)
    for (const p of picks) expect(p.why).toBe('Easy, warm chat to start with.')
    expect(picks.some((p: any) => p.kind === 'episode' && p.episodeId)).toBe(true)
    expect(picks.some((p: any) => p.kind === 'show' && (p.podcastId || p.appleId))).toBe(true)
    expect(prompts[0]).toContain('Vardagssvenska')
    // Counted against the daily spending cap at its real cost.
    expect([...ledger.entries.entries()].some(([k, v]) => k.startsWith('mood-') && v > 0)).toBe(true)

    // The same mood in other words order is answered from the cache, for free.
    expect((await ask('everyday swedish, something CALM')).status).toBe(200)
    expect(calls).toBe(1)

    // A free learner gets a few new moods a day.
    for (const m of ['football stories', 'gardening', 'science facts', 'history quiz'].slice(0, MOOD_LIMITS.freePerDay - 1)) expect((await ask(m)).status).toBe(200)
    const over = await ask('cooking for friends')
    expect(over.status).toBe(429)
    expect((await over.json()).error).toBe(MOOD_MESSAGES.freeUsed)
    expect((await ask('   ')).status).toBe(400)
  })

  it('prepares an episode on a learner’s own keys: no allowance, their providers, keys gone afterwards (PC-1017-K1)', async () => {
    const SECRET = Buffer.alloc(32, 3).toString('base64')
    const keys = { elevenlabs: 'sk_eleven_abcdefghijklmnopqrstuvwx', gemini: 'AIzaSy-abcdefghijklmnopqrstuvwxyz0123' }
    const anna = await learner()
    const [show] = await sql`select id from podcasts where feed_url = ${FEED_URL}`
    const newEpisode = async (guid: string) =>
      (await sql`insert into episodes (podcast_id, guid, title, duration_sec, audio_url, language) values (${show!.id}, ${guid}, ${guid}, 600, ${'https://cdn.example.com/' + guid + '.mp3'}, 'sv') returning id`)[0]!.id as string
    const app = createApi({ sql, verify: async (t) => t, fetch: fakeFetch, lookupHost: publicHost, ownKeysSecret: SECRET })
    const prepare = (episodeId: string, body: unknown) =>
      app.request(`/v1/episodes/${episodeId}/prepare`, { method: 'POST', headers: { Authorization: `Bearer ${anna}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

    // Both keys are needed; then it queues on her keys without touching her free episode.
    const ep1 = await newEpisode('own-1')
    expect((await prepare(ep1, { ownKeys: { elevenlabs: keys.elevenlabs } })).status).toBe(400)
    const queued = await (await prepare(ep1, { ownKeys: keys })).json()
    expect(queued).toMatchObject({ status: 'queued', charge: 'ownKeys' })
    expect((await sql`select free_episode_used from profiles where id = ${anna}`)[0]!.free_episode_used).toBe(false)
    const [held] = await sql`select elevenlabs, gemini from job_keys where job_id = ${queued.jobId}`
    expect(held!.elevenlabs).not.toContain(keys.elevenlabs) // sealed

    // The worker uses providers built on her keys, and nothing goes against Polycast's cap.
    const usedKeys: string[] = []
    const w = worker()
    const own = { ...w, ownKeys: { secret: SECRET, providers: (k: { elevenlabs: string; gemini: string }) => (usedKeys.push(k.elevenlabs, k.gemini), { transcriber: w.transcriber, speech: w.speech, text: w.text }) } }
    const failing = { ...w, text: mockText(() => { throw new Error('Polycast’s own key must not be used') }) }
    const job = (await claimNextJob(sql, 'learners'))!
    expect(job.ownKeys).toBe(true)
    expect(await runJob({ ...own, text: failing.text }, job)).toBe('done')
    expect(usedKeys).toEqual([keys.elevenlabs, keys.gemini])
    expect((await sql`select count(*)::int as n from spend_ledger where job_id = ${job.id}`)[0]!.n).toBe(0)
    expect((await sql`select count(*)::int as n from job_keys where job_id = ${job.id}`)[0]!.n).toBe(0)
    expect((await sql`select status from episodes where id = ${ep1}`)[0]!.status).toBe('ready') // in the shared pool

    // A key their provider turns down fails the job in plain words, with no fallback to Polycast's.
    const ep2 = await newEpisode('own-2')
    await prepare(ep2, { ownKeys: keys })
    const job2 = (await claimNextJob(sql, 'learners'))!
    const refused = { ...own, ownKeys: { secret: SECRET, providers: () => ({ transcriber: { transcribe: async () => { throw new ProviderError('unauthorised', false, 401) } } as any, speech: w.speech, text: w.text }) } }
    expect(await runJob(refused, job2)).toBe('failed')
    expect((await sql`select error from prep_jobs where id = ${job2.id}`)[0]!.error).toMatch(/ElevenLabs key was turned down/)
    expect((await sql`select count(*)::int as n from job_keys where job_id = ${job2.id}`)[0]!.n).toBe(0)

    // Removing her keys forgets every copy, even for a job still waiting.
    const ep3 = await newEpisode('own-3')
    await prepare(ep3, { ownKeys: keys })
    const del = await (await app.request('/v1/keys', { method: 'DELETE', headers: { Authorization: `Bearer ${anna}` } })).json()
    expect(del.forgotten).toBe(1)
    const job3 = (await claimNextJob(sql, 'learners'))!
    expect(await runJob(own, job3)).toBe('failed')

    // Fair use: a generous number a day.
    await sql`update prep_jobs set created_at = now() where requested_by = ${anna}`
    for (let i = 0; i < OWN_KEYS_LIMITS.preparationsPerDay - 3; i++) await prepare(await newEpisode(`own-fill-${i}`), { ownKeys: keys })
    expect((await prepare(await newEpisode('own-over'), { ownKeys: keys })).status).toBe(429)
    await sql`delete from prep_jobs where requested_by = ${anna} and status = 'queued'`

    // Off without the server's secret.
    const off = createApi({ sql, verify: async (t) => t, fetch: fakeFetch, lookupHost: publicHost })
    expect((await off.request(`/v1/episodes/${ep3}/prepare`, { method: 'POST', headers: { Authorization: `Bearer ${anna}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ownKeys: keys }) })).status).toBe(503)
  })
})
