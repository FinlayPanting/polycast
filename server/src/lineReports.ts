import type { LineReport } from '@polycast/core'
import type { Sql } from './db'

/**
 * 'That looks wrong' (PC-1018-04): a learner flags a subtitle line or its translation.
 * Only the episode, the line and the time are kept, never who reported it. Reports live in the
 * server-only alerts table (kind 'line_report'), so no new table or migration is needed.
 */
export const LINE_REPORT_KIND = 'line_report'
export const LINE_REPORT_LIMITS = { perHour: 20 }

/** Records a report if the episode has that line; false when it doesn't. */
export async function reportLine(sql: Sql, episodeId: string, segmentId: string): Promise<boolean> {
  const [line] = await sql`
    select 1 from transcripts t, jsonb_array_elements(t.segments) seg
    where t.episode_id = ${episodeId} and seg->>'id' = ${segmentId}
    limit 1`
  if (!line) return false
  await sql`insert into alerts (kind, message) values (${LINE_REPORT_KIND}, ${JSON.stringify({ episodeId, segmentId })})`
  return true
}

/** An episode's reported lines, counted per line. */
export async function lineReports(sql: Sql, episodeId: string): Promise<LineReport[]> {
  const rows = await sql`
    select message::jsonb->>'segmentId' as segment_id, count(*)::int as count, max(created_at) as last_at
    from alerts
    where kind = ${LINE_REPORT_KIND} and message::jsonb->>'episodeId' = ${episodeId}
    group by 1`
  return rows.map((r) => ({ segmentId: String(r.segment_id), count: r.count, lastAt: new Date(r.last_at).toISOString() }))
}
