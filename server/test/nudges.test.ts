import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from '../src/db'
import { dueNudges, nudgeText, sendNudges } from '../src/nudges'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip
const NOON = new Date('2026-10-16T12:00:00Z')

run('new-episode nudges', () => {
  let sql: Sql
  let drop: () => Promise<void>
  let podcast: string
  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
    ;[{ id: podcast }] = (await sql`insert into podcasts (feed_url, title) values ('https://f.example/a.xml', 'Alex & Sigges') returning id`) as any
  })
  afterAll(async () => drop?.())

  const episode = async (daysAgo: number) =>
    ((await sql`insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, language)
      values (${podcast}, ${randomUUID()}, ${`Ep ${daysAgo}`}, now() - make_interval(days => ${daysAgo}), 1800, 'https://a.example/x.mp3', 'sv') returning id`)[0]!.id as string)

  async function learner(token: string | null = 'ExponentPushToken[x]') {
    const id = randomUUID()
    await sql`insert into auth.users (id) values (${id})`
    await sql`update profiles set push_token = ${token} where id = ${id}`
    return id
  }

  it('nudges about a new episode of a finished show, once a week at most', async () => {
    const old = await episode(10)
    const finishedAt = new Date(Date.now() - 9 * 86400_000)
    const lea = await learner()
    await sql`insert into listens (user_id, episode_id, finished_at) values (${lea}, ${old}, ${finishedAt})`
    // Nothing new yet.
    expect(await dueNudges(sql)).toEqual([])

    await episode(3)
    const newest = await episode(1)
    const pushes: any[] = []
    expect(await sendNudges(sql, async (...a) => void pushes.push(a), NOON)).toBe(1)
    expect(pushes).toEqual([['ExponentPushToken[x]', 'Alex & Sigges', 'New Alex & Sigges is out. Get it ready?', { episodeId: newest }]])

    // Another episode the next day: still inside the week, so nothing more.
    await episode(0)
    expect(await sendNudges(sql, async (...a) => void pushes.push(a), NOON)).toBe(0)
    expect(pushes).toHaveLength(1)
  })

  it('leaves alone learners without notifications, episodes already heard, and night time', async () => {
    const old = await episode(20)
    const quiet = await learner(null)
    await sql`insert into listens (user_id, episode_id, finished_at) values (${quiet}, ${old}, now() - interval '15 days')`
    const heard = await learner()
    await sql`insert into listens (user_id, episode_id, finished_at) values (${heard}, ${old}, now() - interval '15 days')`
    for (const e of await sql`select id from episodes where published > now() - interval '15 days'`)
      await sql`insert into listens (user_id, episode_id) values (${heard}, ${e.id}) on conflict do nothing`
    expect((await dueNudges(sql)).map((n) => n.userId)).not.toContain(quiet)
    expect((await dueNudges(sql)).map((n) => n.userId)).not.toContain(heard)

    const sleepy = await learner()
    await sql`insert into listens (user_id, episode_id, finished_at) values (${sleepy}, ${old}, now() - interval '15 days')`
    expect((await dueNudges(sql)).map((n) => n.userId)).toContain(sleepy)
    expect(await sendNudges(sql, async () => {}, new Date('2026-10-16T02:00:00Z'))).toBe(0)
  })

  it('reads plainly', () => {
    expect(nudgeText({ podcastTitle: 'Gemischtes Hack' }).body).toBe('New Gemischtes Hack is out. Get it ready?')
  })
})
