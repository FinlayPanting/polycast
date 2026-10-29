import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from '../src/db'
import { isNudgeHour, localHour, sendFirstListenNudges, sendNudges } from '../src/nudges'
import { freshDatabase, PG_TEST_URL } from './pg'

describe('nudges in the learner’s own daytime (PC-1028-01)', () => {
  const at = (iso: string) => new Date(iso)
  it('reads the hour on the learner’s clock', () => {
    expect(localHour('America/Los_Angeles', at('2026-10-16T12:00:00Z'))).toBe(5)
    expect(localHour('America/New_York', at('2026-10-16T12:00:00Z'))).toBe(8)
    expect(localHour('Europe/London', at('2026-12-16T12:00:00Z'))).toBe(12)
    expect(localHour('Asia/Kolkata', at('2026-10-16T12:00:00Z'))).toBe(17)
    expect(localHour('Not/AZone', at('2026-10-16T12:00:00Z'))).toBeUndefined()
  })
  it('sends between 10:00 and 20:00 where they are', () => {
    // 12:00 UTC: 05:00 in California, 08:00 in New York, 14:00 in Berlin.
    const noonUtc = at('2026-10-16T12:00:00Z')
    expect(isNudgeHour('America/Los_Angeles', noonUtc)).toBe(false)
    expect(isNudgeHour('America/New_York', noonUtc)).toBe(false)
    expect(isNudgeHour('Europe/Berlin', noonUtc)).toBe(true)
    // 19:00 UTC: noon in California, 15:00 in New York, 21:00 in Berlin.
    const evening = at('2026-10-16T19:00:00Z')
    expect(isNudgeHour('America/Los_Angeles', evening)).toBe(true)
    expect(isNudgeHour('America/New_York', evening)).toBe(true)
    expect(isNudgeHour('Europe/Berlin', evening)).toBe(false)
    // Edges: 10:00 is in, 20:00 is out.
    expect(isNudgeHour('Europe/London', at('2026-12-16T10:00:00Z'))).toBe(true)
    expect(isNudgeHour('Europe/London', at('2026-12-16T20:00:00Z'))).toBe(false)
  })
  it('falls back to Europe’s daytime when the phone sent no time zone, or one we don’t know', () => {
    expect(isNudgeHour(null, at('2026-10-16T12:00:00Z'))).toBe(true)
    expect(isNudgeHour(undefined, at('2026-10-16T02:00:00Z'))).toBe(false)
    expect(isNudgeHour('Not/AZone', at('2026-10-16T09:00:00Z'))).toBe(true)
    expect(isNudgeHour('Not/AZone', at('2026-10-16T19:00:00Z'))).toBe(false)
  })
})

const run = PG_TEST_URL ? describe : describe.skip

run('nudges wait for daytime where each learner is (PC-1028-01)', () => {
  let sql: Sql
  let drop: () => Promise<void>
  let show: string
  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
    ;[{ id: show }] = (await sql`insert into podcasts (feed_url, title) values ('https://f.example/tz.xml', 'Svenska Samtal') returning id`) as any
    await sql`insert into picks (language, podcast_id, position) values ('sv', ${show}, 0)`
    await sql`insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, language, status)
      values (${show}, ${randomUUID()}, 'Fika', now() - interval '2 days', 600, 'https://a.example/x.mp3', 'sv', 'ready')`
  })
  afterAll(async () => drop?.())

  async function newcomer(timeZone: string | null) {
    const id = randomUUID()
    await sql`insert into auth.users (id) values (${id})`
    await sql`update profiles set push_token = ${`ExponentPushToken[${id}]`}, time_zone = ${timeZone}, target_language = 'sv',
      created_at = now() - interval '30 hours' where id = ${id}`
    return id
  }

  it('first-listen nudge: New York waits until its morning, Berlin hears now, and no one is claimed early', async () => {
    const ny = await newcomer('America/New_York')
    const berlin = await newcomer('Europe/Berlin')
    const unknown = await newcomer(null)
    const tokens: string[] = []
    const push = async (to: string) => void tokens.push(to)

    // 12:00 UTC: 08:00 in New York.
    expect(await sendFirstListenNudges(sql, push, new Date('2026-10-16T12:00:00Z'))).toBe(2)
    expect(tokens).toEqual(expect.arrayContaining([`ExponentPushToken[${berlin}]`, `ExponentPushToken[${unknown}]`]))
    expect(tokens).not.toContain(`ExponentPushToken[${ny}]`)
    const [nyRow] = await sql`select last_nudged_at from profiles where id = ${ny}`
    expect(nyRow!.last_nudged_at).toBeNull()

    // 15:00 UTC: 11:00 in New York; the others were already nudged.
    expect(await sendFirstListenNudges(sql, push, new Date('2026-10-16T15:00:00Z'))).toBe(1)
    expect(tokens.at(-1)).toBe(`ExponentPushToken[${ny}]`)
  })

  it('weekly nudges skip learners for whom it is night', async () => {
    const la = await newcomer('America/Los_Angeles')
    // Not due a first-listen nudge (already had one); finished the show, and a new episode is out.
    await sql`update profiles set last_nudged_at = now() - interval '10 days' where id = ${la}`
    const [{ id: old }] = (await sql`insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, language, status)
      values (${show}, ${randomUUID()}, 'Gammalt', now() - interval '9 days', 600, 'https://a.example/y.mp3', 'sv', 'ready') returning id`) as any
    await sql`insert into listens (user_id, episode_id, finished_at) values (${la}, ${old}, now() - interval '8 days')`
    await sql`insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, language, status)
      values (${show}, ${randomUUID()}, 'Nytt', now() - interval '1 day', 600, 'https://a.example/z.mp3', 'sv', 'ready')`
    const sent: string[] = []
    const push = async (to: string) => void sent.push(to)
    // 12:00 UTC is 05:00 in Los Angeles.
    expect(await sendNudges(sql, push, new Date('2026-10-16T12:00:00Z'))).toBe(0)
    // 19:00 UTC is noon there.
    expect(await sendNudges(sql, push, new Date('2026-10-16T19:00:00Z'))).toBe(1)
    expect(sent).toEqual([`ExponentPushToken[${la}]`])
  })
})
