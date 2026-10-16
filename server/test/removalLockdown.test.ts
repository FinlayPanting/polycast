import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from '../src/db'
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
})
