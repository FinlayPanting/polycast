import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from '../src/api'
import { runJob } from '../src/worker'
import { claimNextJob, type Sql } from '../src/db'
import { memoryStorage, mockSpeech, mockText, mockTranscriber } from '../src/providers/mock'
import { draftFor, syntheticEpisode } from './fixtures'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip

const FEED_URL = 'https://feeds.example.com/svenska.xml'
const RSS = `<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
  <title>Svenska Samtal</title><language>sv</language><itunes:author>Anna</itunes:author>
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
    createApi({ sql, verify: async (t) => (t.startsWith('bad') ? undefined : t), fetch: fakeFetch, alert: async (k, m) => void alerts.push(`${k}: ${m}`) })

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

    const listen = await (await call(anna, 'POST', `/v1/episodes/${episodeId}/listen`)).json()
    expect(listen.guided).toBe(true)
    expect(listen.guidanceLevel).toBe('standard')
    expect(listen.episode.audioUrl).toBe('https://cdn.example.com/1.mp3')
    expect(listen.transcript.segments.length).toBeGreaterThan(10)
    expect(listen.plan.moments.length).toBeGreaterThan(5)
  })

  it('serves a ready episode free to the next learner, and explains refusals in plain English', async () => {
    const erik = await learner()
    const opened = await (await call(erik, 'POST', '/v1/podcasts/open', { feedUrl: FEED_URL })).json()
    const ready = opened.episodes.find((e: any) => e.status === 'ready')
    expect(await (await call(erik, 'POST', `/v1/episodes/${ready.id}/prepare`)).json()).toEqual({ status: 'ready' })

    // Erik uses his free episode on the other one; a third request is refused with a reason.
    const other = opened.episodes.find((e: any) => e.status !== 'ready')
    expect((await (await call(erik, 'POST', `/v1/episodes/${other.id}/prepare`)).json()).charge).toBe('freeEpisode')
    await sql`update episodes set status = 'none' where id = ${other.id}`
    await sql`update prep_jobs set status = 'failed' where episode_id = ${other.id}`
    const refused = await call(erik, 'POST', `/v1/episodes/${other.id}/prepare`)
    expect(refused.status).toBe(402)
    expect((await refused.json()).message).toMatch(/used your free episode/)
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

  it('accepts a creator’s removal request without an account, and alerts Finlay', async () => {
    const res = await api().request('/removal-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ podcastTitle: 'Svenska Samtal', contact: 'anna@example.com' }) })
    expect(res.status).toBe(200)
    expect(alerts.some((a) => a.startsWith('removal:'))).toBe(true)
  })
})
