import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isKindNudge } from '@polycast/core'
import type { Sql } from '../src/db'
import { dueFirstListenNudges, firstListenText, minutesLabel, sendFirstListenNudges, sendNudges } from '../src/nudges'
import { freshDatabase, PG_TEST_URL } from './pg'

describe('first-listen nudge text (PC-1026-09)', () => {
  it('names the episode and how long it is, in the guide’s voice, kindly', () => {
    const t = firstListenText({ guideName: 'Mia', podcastTitle: 'Svenska Samtal', episodeTitle: 'Fika på jobbet', durationSec: 734 })
    expect(t).toEqual({ title: 'Svenska Samtal', body: 'Mia: “Fika på jobbet” (12 min) is a good one to start with. It’s ready when you are.' })
    expect(isKindNudge(t.body)).toBe(true)
    expect(minutesLabel(20)).toBe('1 min')
    expect(minutesLabel(3600)).toBe('60 min')
  })
})

const run = PG_TEST_URL ? describe : describe.skip
const NOON = new Date('2026-10-16T12:00:00Z')

run('one nudge if the first listen hasn’t happened (PC-1026-09)', () => {
  let sql: Sql
  let drop: () => Promise<void>
  let pickShow: string
  let pickEp: string
  let otherShow: string
  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
    ;[{ id: pickShow }] = (await sql`insert into podcasts (feed_url, title) values ('https://f.example/pick.xml', 'Svenska Samtal') returning id`) as any
    ;[{ id: otherShow }] = (await sql`insert into podcasts (feed_url, title) values ('https://f.example/other.xml', 'Alex & Sigges') returning id`) as any
    await sql`insert into picks (language, podcast_id, position) values ('sv', ${pickShow}, 0)`
    await episode(pickShow, 'Gammalt', 10, 'ready')
    pickEp = await episode(pickShow, 'Fika på jobbet', 2, 'ready', 734)
    await episode(pickShow, 'Inte klart', 1, 'none')
  })
  afterAll(async () => drop?.())

  async function episode(podcast: string, title: string, daysAgo: number, status: string, durationSec = 1800) {
    return (await sql`insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, language, status)
      values (${podcast}, ${randomUUID()}, ${title}, now() - make_interval(days => ${daysAgo}), ${durationSec}, 'https://a.example/x.mp3', 'sv', ${status}) returning id`)[0]!.id as string
  }

  async function learner(opts: { hoursAgo?: number; token?: string | null; language?: string | null; guide?: string } = {}) {
    const id = randomUUID()
    await sql`insert into auth.users (id) values (${id})`
    await sql`update profiles set push_token = ${opts.token === undefined ? 'ExponentPushToken[x]' : opts.token}, target_language = ${opts.language === undefined ? 'sv' : opts.language},
      guide_id = ${opts.guide ?? 'mia'}, created_at = now() - make_interval(hours => ${opts.hoursAgo ?? 30}) where id = ${id}`
    return id
  }
  const due = async (id: string) => (await dueFirstListenNudges(sql)).find((n) => n.userId === id)

  it('a day after signing up, names the first Polycast pick’s newest ready episode, once, then never again', async () => {
    const lea = await learner()
    expect(await due(lea)).toMatchObject({ episodeId: pickEp, episodeTitle: 'Fika på jobbet', podcastTitle: 'Svenska Samtal', durationSec: 734, guideName: 'Mia' })
    const sent: { to: string; title: string; body: string; data: Record<string, string> }[] = []
    const push = async (to: string, title: string, body: string, data: Record<string, string>) => void sent.push({ to, title, body, data })
    expect(await sendFirstListenNudges(sql, push, NOON)).toBeGreaterThanOrEqual(1)
    const mine = sent.filter((s) => s.data.episodeId === pickEp)
    expect(mine.length).toBeGreaterThanOrEqual(1)
    expect(mine[0]!.body).toBe('Mia: “Fika på jobbet” (12 min) is a good one to start with. It’s ready when you are.')
    expect(await due(lea)).toBeUndefined()
    const before = sent.length
    await sendFirstListenNudges(sql, push, NOON)
    expect(sent.length).toBe(before)
  })

  it('prefers the episode the learner asked to get ready, once it’s ready', async () => {
    const own = await episode(otherShow, 'Avsnitt 7', 3, 'ready', 1500)
    const lea = await learner({ guide: 'leo' })
    await sql`insert into prep_jobs (episode_id, requested_by, guide_id, charge) values (${own}, ${lea}, 'leo', 'freeEpisode')`
    expect(await due(lea)).toMatchObject({ episodeId: own, podcastTitle: 'Alex & Sigges', guideName: 'Leo', durationSec: 1500 })
    const waiting = await episode(otherShow, 'Avsnitt 8', 1, 'preparing')
    const sam = await learner()
    await sql`insert into prep_jobs (episode_id, requested_by, guide_id, charge) values (${waiting}, ${sam}, 'mia', 'freeEpisode')`
    expect((await due(sam))?.episodeId).toBe(pickEp)
  })

  it('names an episode in the language they’re learning now, not one they asked for before switching (PC-1027-02)', async () => {
    const [{ id: esShow }] = (await sql`insert into podcasts (feed_url, title) values ('https://f.example/es.xml', 'Charlas') returning id`) as any
    await sql`insert into picks (language, podcast_id, position) values ('es', ${esShow}, 0)`
    const esEp = (await sql`insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, language, status)
      values (${esShow}, ${randomUUID()}, 'Café con leche', now() - interval '1 day', 900, 'https://a.example/es.mp3', 'es', 'ready') returning id`)[0]!.id as string
    const sv = await episode(otherShow, 'Avsnitt 9', 2, 'ready', 1200)
    const lea = await learner({ language: 'es' })
    await sql`insert into prep_jobs (episode_id, requested_by, guide_id, charge) values (${sv}, ${lea}, 'mia', 'freeEpisode')`
    expect(await due(lea)).toMatchObject({ episodeId: esEp, podcastTitle: 'Charlas' })
    const ownEs = (await sql`insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, language, status)
      values (${esShow}, ${randomUUID()}, 'Mi episodio', now() - interval '3 days', 600, 'https://a.example/es2.mp3', 'es', 'ready') returning id`)[0]!.id as string
    await sql`insert into prep_jobs (episode_id, requested_by, guide_id, charge) values (${ownEs}, ${lea}, 'mia', 'freeEpisode')`
    expect((await due(lea))?.episodeId).toBe(ownEs)
  })

  it('leaves alone anyone too new, too old, without notifications, without a language, or already listening with the guide', async () => {
    expect(await due(await learner({ hoursAgo: 20 }))).toBeUndefined()
    expect(await due(await learner({ hoursAgo: 24 * 8 }))).toBeUndefined()
    expect(await due(await learner({ token: null }))).toBeUndefined()
    expect(await due(await learner({ language: null }))).toBeUndefined()
    expect(await due(await learner({ language: 'it' }))).toBeUndefined() // no ready pick in Italian
    const listened = await learner()
    await sql`insert into listens (user_id, episode_id, guided) values (${listened}, ${pickEp}, true)`
    expect(await due(listened)).toBeUndefined()
    const subtitlesOnly = await learner()
    await sql`insert into listens (user_id, episode_id, guided) values (${subtitlesOnly}, ${pickEp}, false)`
    expect(await due(subtitlesOnly)).toBeDefined()
    const nudgedBefore = await learner()
    await sql`update profiles set last_nudged_at = now() - interval '30 days' where id = ${nudgedBefore}`
    expect(await due(nudgedBefore)).toBeUndefined()
  })

  it('sends nothing at night, and doesn’t get in the way of the weekly nudges', async () => {
    const lea = await learner()
    const night = new Date('2026-10-16T02:00:00Z')
    expect(await sendFirstListenNudges(sql, async () => {}, night)).toBe(0)
    expect(await due(lea)).toBeDefined()
    expect(await sendNudges(sql, async () => {}, NOON)).toBe(0)
  })
})
