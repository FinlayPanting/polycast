import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi, lastMonday } from '../src/api'
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
    })
    expect(funnelText(f)).toContain('Picked a language: 2 (67%)')
  })

  it('serves the funnel only with the token', async () => {
    expect((await api().request('/admin/funnel?week=2026-10-05')).status).toBe(401)
    const res = await api().request('/admin/funnel?week=2026-10-05', { headers: { Authorization: 'Bearer t0ken' } })
    expect(res.status).toBe(200)
    expect((await res.json()).funnel.signedUp).toBe(3)
    expect((await api().request('/admin/funnel?week=soon', { headers: { Authorization: 'Bearer t0ken' } })).status).toBe(400)
  })

  it('counts "Learning something else?" taps per language, with nothing else (PC-1023-02)', async () => {
    const post = (body: unknown) => api().request('/events/language-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    for (const language of ['nl', 'ja', 'nl', 'other']) expect((await post({ language })).status).toBe(200)
    expect((await post({ language: 'es' })).status).toBe(400) // already offered
    expect((await post({ language: 'xx' })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    const cols = await sql`select column_name from information_schema.columns where table_name = 'language_requests' order by column_name`
    expect(cols.map((c) => c.column_name)).toEqual(['day', 'language', 'requests'])
    await sql`update language_requests set day = '2026-10-07'`
    const res = await api().request('/admin/funnel?week=2026-10-05', { headers: { Authorization: 'Bearer t0ken' } })
    const body = await res.json()
    expect(body.languageRequests).toEqual([
      { language: 'nl', name: 'Dutch', requests: 2 },
      { language: 'ja', name: 'Japanese', requests: 1 },
      { language: 'other', name: 'Something else', requests: 1 },
    ])
    expect(body.text).toContain('Asked for other languages: Dutch 2, Japanese 1, Something else 1')
    const next = await (await api().request('/admin/funnel?week=2026-10-12', { headers: { Authorization: 'Bearer t0ken' } })).json()
    expect(next.text).toContain('Asked for other languages: none')
  })

  it('also takes the token in the address, for the morning email', async () => {
    expect((await api().request('/admin/funnel?week=2026-10-05&token=t0ken')).status).toBe(200)
    expect((await api().request('/admin/funnel?week=2026-10-05&token=wrong')).status).toBe(401)
    expect((await api().request('/admin/funnel?week=2026-10-05&token=')).status).toBe(401)
  })
})
