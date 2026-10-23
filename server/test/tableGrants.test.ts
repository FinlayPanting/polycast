import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from '../src/db'
import { freshDatabase, PG_TEST_URL } from './pg'

/**
 * Supabase's 30 Oct 2026 change (PC-1018-01): new tables are no longer exposed to the app's keys
 * automatically, so a table the app reads without a grant would fail with "permission denied".
 * Every table a new migration creates must say who may use it: an explicit `grant ... on <table>`,
 * `revoke all on <table> from anon, authenticated`, or a `-- server-only: <table>` comment.
 */
const dir = join(__dirname, '../supabase/migrations')

/** Tables from migrations written before the rule; their access is already tested elsewhere. */
const BEFORE_THE_RULE = new Set([
  'settings', 'profiles', 'podcasts', 'episodes', 'transcripts', 'lesson_plans', 'prep_jobs', 'spend_ledger',
  'saved_words', 'listens', 'picks', 'chart_cache', 'removal_requests', 'alerts', 'first_opens',
])
const FIRST_RULED_MIGRATION = 12

/** Tables a migration creates that it never says who may use. */
export function tablesWithoutAccess(migration: string): string[] {
  const sql = migration.toLowerCase()
  const created = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/g)].map((m) => m[1]!)
  const statements = sql.split(';')
  return created.filter((t) => {
    const named = new RegExp(`(^|[\\s,.(])"?${t}"?(?=[\\s,;)]|$)`)
    const said = statements.some((s) => {
      const st = s.replace(/--[^\n]*/g, '').trim()
      return /^(grant|revoke)\b/.test(st) && /\bon\b/.test(st) && named.test(st.slice(st.search(/\bon\b/)))
    })
    return !said && !new RegExp(`--\\s*server-only:[^\\n]*\\b${t}\\b`).test(sql)
  })
}

describe('every new table says who may use it (PC-1018-01)', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  it('holds for every migration from 0012 on', () => {
    const missing = files
      .filter((f) => Number.parseInt(f, 10) >= FIRST_RULED_MIGRATION)
      .flatMap((f) => tablesWithoutAccess(readFileSync(join(dir, f), 'utf8')).map((t) => `${f}: ${t}`))
    expect(missing, 'add a grant, "revoke all on <table> from anon, authenticated", or "-- server-only: <table>"').toEqual([])
  })

  it('only lets the tables from before the rule off', () => {
    const older = files
      .filter((f) => Number.parseInt(f, 10) < FIRST_RULED_MIGRATION)
      .flatMap((f) => tablesWithoutAccess(readFileSync(join(dir, f), 'utf8')))
    for (const t of older) expect(BEFORE_THE_RULE.has(t), t).toBe(true)
  })

  it('spots a table with no grant', () => {
    expect(tablesWithoutAccess('create table if not exists streaks (id int primary key);')).toEqual(['streaks'])
    expect(tablesWithoutAccess('create table public.streaks (id int);\nalter table streaks enable row level security;')).toEqual(['streaks'])
  })

  it('accepts a grant, a revoke or a server-only note', () => {
    expect(tablesWithoutAccess('create table streaks (id int);\ngrant select on streaks to authenticated;')).toEqual([])
    expect(tablesWithoutAccess('create table streaks (id int);\ngrant select, insert on saved_words, streaks to authenticated;')).toEqual([])
    expect(tablesWithoutAccess('create table if not exists plus_screen_views (day date);\nrevoke all on plus_screen_views from anon, authenticated;')).toEqual([])
    expect(tablesWithoutAccess('-- server-only: streaks (the API reads it with the service key)\ncreate table streaks (id int);')).toEqual([])
  })

  it('is not fooled by a grant on a table with a longer name', () => {
    expect(tablesWithoutAccess('create table streaks (id int);\ngrant select on streaks_archive to authenticated;')).toEqual(['streaks'])
  })
})

const run = PG_TEST_URL ? describe : describe.skip

run("the test database follows Supabase's new rule", () => {
  let sql: Sql
  let drop: () => Promise<void>
  beforeAll(async () => void ({ sql, drop } = await freshDatabase()))
  afterAll(async () => drop?.())

  it('gives a new table no access for the app until it is granted', async () => {
    await sql`create table after_the_rule (id int primary key)`
    const [before] = await sql`select
      has_table_privilege('authenticated', 'after_the_rule', 'select') as learner,
      has_table_privilege('anon', 'after_the_rule', 'select') as anon`
    expect(before).toEqual({ learner: false, anon: false })
    await sql`grant select on after_the_rule to authenticated`
    const [after] = await sql`select has_table_privilege('authenticated', 'after_the_rule', 'select') as learner`
    expect(after).toEqual({ learner: true })
  })

  it('keeps the grants the app relies on today', async () => {
    const [r] = await sql`select
      has_table_privilege('authenticated', 'profiles', 'select') as profiles,
      has_table_privilege('authenticated', 'saved_words', 'select') as words,
      has_table_privilege('authenticated', 'episodes', 'select') as episodes,
      has_table_privilege('authenticated', 'prep_jobs', 'select') as jobs,
      has_table_privilege('authenticated', 'listens', 'select') as listens`
    expect(r).toEqual({ profiles: true, words: true, episodes: true, jobs: true, listens: true })
  })
})
