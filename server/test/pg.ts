import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import type { Sql } from '../src/db'

export const PG_TEST_URL = process.env.PG_TEST_URL

/** Creates a fresh database with the Supabase shim and every migration applied. */
export async function freshDatabase(): Promise<{ sql: Sql; drop: () => Promise<void> }> {
  const admin = postgres(PG_TEST_URL!, { max: 1, onnotice: () => {} })
  const name = `polycast_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  await admin.unsafe(`create database ${name}`)
  const url = new URL(PG_TEST_URL!)
  url.pathname = `/${name}`
  const sql = postgres(url.toString(), { max: 6, onnotice: () => {}, transform: { undefined: null } })
  await sql.unsafe(readFileSync(join(__dirname, 'sql/supabase_shim.sql'), 'utf8'))
  const dir = join(__dirname, '../supabase/migrations')
  for (const f of readdirSync(dir).sort()) await sql.unsafe(readFileSync(join(dir, f), 'utf8'))
  return {
    sql,
    drop: async () => {
      await sql.end()
      await admin.unsafe(`drop database if exists ${name} with (force)`)
      await admin.end()
    },
  }
}
