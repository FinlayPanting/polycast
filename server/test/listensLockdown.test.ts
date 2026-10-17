import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from '../src/db'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip

run('listens, transcripts and lesson plans with the public key', () => {
  let sql: Sql
  let drop: () => Promise<void>
  beforeAll(async () => void ({ sql, drop } = await freshDatabase()))
  afterAll(async () => drop?.())

  it('lets a learner read their listens and update only position and finish time', async () => {
    const [r] = await sql`select
      has_table_privilege('authenticated', 'listens', 'select') as read,
      has_table_privilege('authenticated', 'listens', 'insert') as add,
      has_table_privilege('authenticated', 'listens', 'delete') as remove,
      has_column_privilege('authenticated', 'listens', 'position_sec', 'update') as position,
      has_column_privilege('authenticated', 'listens', 'finished_at', 'update') as finished,
      has_column_privilege('authenticated', 'listens', 'updated_at', 'update') as touched,
      has_column_privilege('authenticated', 'listens', 'guided', 'update') as guided,
      has_column_privilege('authenticated', 'listens', 'started_at', 'update') as started`
    expect(r).toEqual({ read: true, add: false, remove: false, position: true, finished: true, touched: true, guided: false, started: false })
  })

  it('keeps lesson plans and transcripts behind the server', async () => {
    const [r] = await sql`select
      has_table_privilege('authenticated', 'transcripts', 'select') as transcripts,
      has_table_privilege('authenticated', 'lesson_plans', 'select') as plans,
      has_table_privilege('anon', 'lesson_plans', 'select') as anon`
    expect(r).toEqual({ transcripts: false, plans: false, anon: false })
    const policies = await sql`select policyname from pg_policies where tablename in ('transcripts', 'lesson_plans')`
    expect(policies).toEqual([])
  })
})
