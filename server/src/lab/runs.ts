import type { Sql } from '../db'

/**
 * Saved Lab runs (migration 0012). If the migration hasn't been applied yet, the Lab still works and
 * just can't save: the page says so.
 */

export type RunKind = 'voice' | 'moment' | 'room' | 'script' | 'plan'

export interface LabRun {
  id: string
  kind: RunKind
  title: string
  config: unknown
  results: unknown
  cost_usd: number
  pick: unknown
  note: string | null
  created_by: 'finlay' | 'claude'
  created_at: string
}

const missingTable = (e: unknown) => (e as { code?: string })?.code === '42P01'

export async function saveRun(sql: Sql, run: { kind: RunKind; title: string; config: unknown; results: unknown; costUSD: number; by: 'finlay' | 'claude' }): Promise<string | undefined> {
  try {
    const [row] = await sql`
      insert into lab_runs (kind, title, config, results, cost_usd, created_by)
      values (${run.kind}, ${run.title.slice(0, 200)}, ${sql.json(run.config as any)}, ${sql.json(run.results as any)}, ${run.costUSD}, ${run.by})
      returning id`
    return row?.id
  } catch (e) {
    if (missingTable(e)) return undefined
    throw e
  }
}

export async function listRuns(sql: Sql, opts: { kind?: RunKind; limit?: number } = {}): Promise<{ runs: LabRun[]; saving: boolean }> {
  try {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50))
    const runs = (await (opts.kind
      ? sql`select * from lab_runs where kind = ${opts.kind} order by created_at desc limit ${limit}`
      : sql`select * from lab_runs order by created_at desc limit ${limit}`)) as unknown as LabRun[]
    return { runs: runs.map((r) => ({ ...r, cost_usd: Number(r.cost_usd) })), saving: true }
  } catch (e) {
    if (missingTable(e)) return { runs: [], saving: false }
    throw e
  }
}

export async function getRun(sql: Sql, id: string): Promise<LabRun | undefined> {
  try {
    const [r] = await sql`select * from lab_runs where id = ${id}`
    return r ? ({ ...r, cost_usd: Number(r.cost_usd) } as LabRun) : undefined
  } catch (e) {
    if (missingTable(e)) return undefined
    throw e
  }
}

export async function pickRun(sql: Sql, id: string, pick: unknown, note: string | undefined): Promise<boolean> {
  try {
    const r = await sql`update lab_runs set pick = ${pick === null || pick === undefined ? null : sql.json(pick as any)}, note = ${note?.slice(0, 2000) ?? null} where id = ${id}`
    return r.count > 0
  } catch (e) {
    if (missingTable(e)) return false
    throw e
  }
}

/** What the Lab has spent: today (UTC), this month and in all. */
export async function labSpend(sql: Sql): Promise<{ todayUSD: number; monthUSD: number; totalUSD: number } | undefined> {
  try {
    const [r] = await sql`
      select
        coalesce(sum(cost_usd) filter (where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'), 0)::float8 as today,
        coalesce(sum(cost_usd) filter (where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'), 0)::float8 as month,
        coalesce(sum(cost_usd), 0)::float8 as total
      from lab_runs`
    return { todayUSD: r!.today, monthUSD: r!.month, totalUSD: r!.total }
  } catch (e) {
    if (missingTable(e)) return undefined
    throw e
  }
}
