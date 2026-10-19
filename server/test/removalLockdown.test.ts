import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { forgetOldRemovalRequests, type Sql } from '../src/db'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip

run('removal requests table', () => {
  let sql: Sql
  let drop: () => Promise<void>
  beforeAll(async () => void ({ sql, drop } = await freshDatabase()))
  afterAll(async () => drop?.())

  it('can no longer be written directly with the public key', async () => {
    const [r] = await sql`select has_table_privilege('anon', 'removal_requests', 'insert') as anon,
      has_table_privilege('authenticated', 'removal_requests', 'insert') as authed`
    expect(r).toEqual({ anon: false, authed: false })
  })

  it('forgets a request 12 months after it was handled, and never one still waiting', async () => {
    await sql`delete from removal_requests`
    await sql`insert into removal_requests (podcast_title, contact, handled_at) values
      ('Old and handled', 'a@example.com', '2025-09-01T00:00:00Z'),
      ('Handled recently', 'b@example.com', '2026-01-01T00:00:00Z'),
      ('Waiting', 'c@example.com', null)`
    await sql`update removal_requests set created_at = '2024-01-01T00:00:00Z' where podcast_title = 'Waiting'`
    expect(await forgetOldRemovalRequests(sql, new Date('2026-10-19T00:00:00Z'))).toBe(1)
    const left = (await sql`select podcast_title from removal_requests order by podcast_title`).map((r) => r.podcast_title)
    expect(left).toEqual(['Handled recently', 'Waiting'])
    expect(await forgetOldRemovalRequests(sql, new Date('2027-01-02T00:00:00Z'))).toBe(1)
    expect((await sql`select podcast_title from removal_requests`).map((r) => r.podcast_title)).toEqual(['Waiting'])
  })
})
