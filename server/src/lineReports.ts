import type { LineReport } from '@polycast/core'
import { createHash } from 'node:crypto'
import type { Sql } from './db'

/**
 * 'That looks wrong' (PC-1018-04): a learner flags a subtitle line or its translation.
 * Only the episode, the line and the time are kept, never who reported it. Reports live in the
 * server-only alerts table (kind 'line_report'), so no new table or migration is needed.
 *
 * One report per learner per line (PC-1021-05): each carries a short one-way key made from the
 * learner, episode and line, so a second press of the same line is ignored without keeping who
 * reported it (the key can't be matched across lines or episodes). An episode's reports are
 * cleared when it's prepared again, and any report goes after 90 days.
 */
export const LINE_REPORT_KIND = 'line_report'
export const LINE_REPORT_LIMITS = { perHour: 20, keepDays: 90 }

/** The one-way key that makes a learner's reports of one line count once. */
export function reportKey(userId: string, episodeId: string, segmentId: string): string {
  return createHash('sha256').update(`line-report:${userId}:${episodeId}:${segmentId}`).digest('hex').slice(0, 24)
}

/** Removes an episode's reports (it was prepared again, so its lines are new). */
export async function clearLineReports(sql: Sql, episodeId: string): Promise<void> {
  await sql`delete from alerts where kind = ${LINE_REPORT_KIND} and message::jsonb->>'episodeId' = ${episodeId}`
}

/** Removes reports older than 90 days. */
export async function pruneLineReports(sql: Sql): Promise<void> {
  await sql`delete from alerts where kind = ${LINE_REPORT_KIND} and created_at < now() - make_interval(days => ${LINE_REPORT_LIMITS.keepDays})`
}

/**
 * Records a report if the episode has that line; false when it doesn't. A learner's repeat report
 * of the same line is accepted but not counted again.
 */
export async function reportLine(sql: Sql, episodeId: string, segmentId: string, userId: string): Promise<boolean> {
  const [line] = await sql`
    select 1 from transcripts t, jsonb_array_elements(t.segments) seg
    where t.episode_id = ${episodeId} and seg->>'id' = ${segmentId}
    limit 1`
  if (!line) return false
  await pruneLineReports(sql)
  const key = reportKey(userId, episodeId, segmentId)
  await sql`
    insert into alerts (kind, message)
    select ${LINE_REPORT_KIND}, ${JSON.stringify({ episodeId, segmentId, key })}
    where not exists (select 1 from alerts where kind = ${LINE_REPORT_KIND} and message::jsonb->>'key' = ${key})`
  return true
}

/** An episode's reported lines, counted per line. */
export async function lineReports(sql: Sql, episodeId: string): Promise<LineReport[]> {
  const rows = await sql`
    select message::jsonb->>'segmentId' as segment_id, count(*)::int as count, max(created_at) as last_at
    from alerts
    where kind = ${LINE_REPORT_KIND} and message::jsonb->>'episodeId' = ${episodeId}
      and created_at >= now() - make_interval(days => ${LINE_REPORT_LIMITS.keepDays})
    group by 1`
  return rows.map((r) => ({ segmentId: String(r.segment_id), count: r.count, lastAt: new Date(r.last_at).toISOString() }))
}
