import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi, FIRST_OPEN_LIMITS, lastMonday } from '../src/api'
import type { Sql } from '../src/db'
import { funnelText, weeklyFunnel } from '../src/funnel'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip

describe('lastMonday', () => {
  it('gives the Monday of the previous full week', () => {
    expect(lastMonday(new Date('2026-10-14T01:00:00Z'))).toBe('2026-10-05') // a Wednesday
    expect(lastMonday(new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-05') // a Monday
    expect(lastMonday(new Date('2026-10-11T23:00:00Z'))).toBe('2026-09-28') // a Sunday
  })
})

run('weekly funnel', () => {
  let sql: Sql
  let drop: () => Promise<void>
  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
  })
  afterAll(async () => drop?.())

  const api = () => createApi({ sql, verify: async () => undefined, fetch: fetch, funnelToken: 't0ken' })

  async function learner(signedUp: string, patch: { target_language?: string; free_episode_used?: boolean; plus?: boolean } = {}) {
    const id = randomUUID()
    await sql`insert into auth.users (id) values (${id})`
    await sql`update profiles set created_at = ${signedUp}, target_language = ${patch.target_language ?? null},
      free_episode_used = ${patch.free_episode_used ?? false}, plus_period_start = ${patch.plus ? signedUp : null} where id = ${id}`
    return id
  }

  it('counts each step for one week of sign-ups, with no identifiers', async () => {
    const [p] = await sql`insert into podcasts (feed_url, title) values ('https://f/x.xml', 'X') returning id`
    const [e] = await sql`insert into episodes (podcast_id, guid, title, audio_url, duration_sec, language) values (${p!.id}, 'g1', 'E', 'https://a/1.mp3', 600, 'sv') returning id`
    const listen = (user: string, at: string, guided: boolean, finished: boolean) =>
      sql`insert into listens (user_id, episode_id, guided, started_at, updated_at, finished_at)
          values (${user}, ${e!.id}, ${guided}, ${at}, ${at}, ${finished ? at : null})`

    for (let i = 0; i < 3; i++) expect((await api().request('/events/first-open', { method: 'POST' })).status).toBe(200)
    await sql`update first_opens set day = '2026-10-06'`

    await learner('2026-10-06T09:00:00Z') // signed up, went no further
    const b = await learner('2026-10-07T09:00:00Z', { target_language: 'sv' })
    await listen(b, '2026-10-07T10:00:00Z', true, false)
    const c = await learner('2026-10-08T09:00:00Z', { target_language: 'de', free_episode_used: true, plus: true })
    await listen(c, '2026-10-16T10:00:00Z', true, true) // came back eight days later
    await learner('2026-10-14T09:00:00Z', { target_language: 'sv' }) // the next week: not counted

    const f = await weeklyFunnel(sql, '2026-10-05')
    expect(f).toEqual({
      weekStart: '2026-10-05', opened: 3, signedUp: 3, pickedLanguage: 2, startedGuided: 2,
      finishedGuided: 1, usedFreeEpisode: 1, startedPlus: 1, cameBack: 1,
      firstListenNudged: 0, startedWithinTwoDays: 0,
    })
    expect(funnelText(f)).toContain('Picked a language: 2 (67%)')
  })

  it('says how many got the day-two nudge and how many started a guided listen within two days of it (PC-1027-04)', async () => {
    const [p] = await sql`insert into podcasts (feed_url, title) values ('https://f/n.xml', 'N') returning id`
    const [e] = await sql`insert into episodes (podcast_id, guid, title, audio_url, duration_sec, language) values (${p!.id}, 'gn', 'E', 'https://a/n.mp3', 600, 'sv') returning id`
    const nudged = async (signedUp: string, nudgedAt: string, listenedAt?: string) => {
      const id = await learner(signedUp, { target_language: 'sv' })
      await sql`update profiles set first_listen_nudged_at = ${nudgedAt}, last_nudged_at = ${nudgedAt} where id = ${id}`
      if (listenedAt) await sql`insert into listens (user_id, episode_id, guided, started_at, updated_at) values (${id}, ${e!.id}, true, ${listenedAt}, ${listenedAt})`
      return id
    }
    await nudged('2026-09-01T09:00:00Z', '2026-09-02T12:00:00Z', '2026-09-03T08:00:00Z') // within two days
    await nudged('2026-09-02T09:00:00Z', '2026-09-03T12:00:00Z', '2026-09-06T08:00:00Z') // later than that
    await nudged('2026-09-03T09:00:00Z', '2026-09-04T12:00:00Z') // not yet
    const lone = await learner('2026-09-03T10:00:00Z', { target_language: 'sv' })
    await sql`update profiles set last_nudged_at = '2026-09-05T12:00:00Z' where id = ${lone}` // a weekly nudge isn't counted
    const f = await weeklyFunnel(sql, '2026-08-31')
    expect(f).toMatchObject({ signedUp: 4, firstListenNudged: 3, startedWithinTwoDays: 1 })
    expect(funnelText(f)).toContain('Got the day-two nudge: 3, of whom 1 started a guided listen within two days (33%)')
    expect(funnelText({ ...f, firstListenNudged: 0, startedWithinTwoDays: 0 })).toContain('Got the day-two nudge: 0, of whom 0 started a guided listen within two days')
  })

  it('counts first opens a few times a day per address at most, so the funnel cannot be pumped', async () => {
    const a = api()
    const before = Number((await sql`select coalesce(sum(opens), 0)::int as n from first_opens`)[0]!.n)
    const from = (ip: string) => a.request('/events/first-open', { method: 'POST', headers: { 'X-Real-IP': ip } })
    for (let i = 0; i < FIRST_OPEN_LIMITS.perAddressPerDay; i++) expect((await from('203.0.113.7')).status).toBe(200)
    expect((await from('203.0.113.7')).status).toBe(429)
    expect((await from('203.0.113.7')).status).toBe(429)
    expect((await from('198.51.100.2')).status).toBe(200) // another address is still counted
    const after = Number((await sql`select coalesce(sum(opens), 0)::int as n from first_opens`)[0]!.n)
    expect(after - before).toBe(FIRST_OPEN_LIMITS.perAddressPerDay + 1)
    await sql`delete from first_opens where day <> '2026-10-06'`
  })

  it('counts a whole IPv6 block as one address, and stops at an overall daily ceiling (PC-1025-03)', async () => {
    const { FIRST_OPEN_LIMITS } = await import('../src/api')
    const a = api()
    const from = (ip: string) => a.request('/events/first-open', { method: 'POST', headers: { 'X-Real-IP': ip } })
    const statuses: number[] = []
    for (let i = 1; i <= 50; i++) statuses.push((await from(`2001:db8:5:6::${i.toString(16)}`)).status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(FIRST_OPEN_LIMITS.perAddressPerDay)
    expect((await from('2001:db8:5:7::1')).status).toBe(200) // the next block along is someone else
    // However many addresses join in, the day's count has a ceiling.
    let accepted = FIRST_OPEN_LIMITS.perAddressPerDay + 1
    for (let i = 0; accepted < FIRST_OPEN_LIMITS.overallPerDay; i++) if ((await from(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`)).status === 200) accepted++
    expect((await from('198.51.100.99')).status).toBe(429)
    await sql`delete from first_opens where day <> '2026-10-06'`
  })

  it('serves the funnel only with the token', async () => {
    expect((await api().request('/admin/funnel?week=2026-10-05')).status).toBe(401)
    const res = await api().request('/admin/funnel?week=2026-10-05', { headers: { Authorization: 'Bearer t0ken' } })
    expect(res.status).toBe(200)
    expect((await res.json()).funnel.signedUp).toBe(3)
    expect((await api().request('/admin/funnel?week=soon', { headers: { Authorization: 'Bearer t0ken' } })).status).toBe(400)
  })

  it('also takes the token in the address, for the morning email', async () => {
    expect((await api().request('/admin/funnel?week=2026-10-05&token=t0ken')).status).toBe(200)
    expect((await api().request('/admin/funnel?week=2026-10-05&token=wrong')).status).toBe(401)
    expect((await api().request('/admin/funnel?week=2026-10-05&token=')).status).toBe(401)
  })
})
