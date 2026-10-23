import { lessonText } from '@polycast/core'
import type { Sql } from './db'
import { LINE_REPORT_KIND, LINE_REPORT_LIMITS, lineReports } from './lineReports'

/** Recently prepared episodes that have a lesson plan, ones with reported lines first, then newest first. */
export async function recentLessons(sql: Sql, limit = 30) {
  // Reports are read once and counted per episode, not re-scanned for every row (PC-1021-05).
  return sql`
    with r as (
      select message::jsonb->>'episodeId' as episode_id, count(*)::int as n
      from alerts
      where kind = ${LINE_REPORT_KIND} and created_at >= now() - make_interval(days => ${LINE_REPORT_LIMITS.keepDays})
      group by 1
    )
    select e.id, e.title, p.title as podcast_title, e.language, e.ready_at, count(l.guide_id)::int as plans, coalesce(max(r.n), 0)::int as reports
    from episodes e join podcasts p on p.id = e.podcast_id join lesson_plans l on l.episode_id = e.id
    left join r on r.episode_id = e.id::text
    where e.status = 'ready'
    group by e.id, p.title
    order by coalesce(max(r.n), 0) > 0 desc, e.ready_at desc nulls last
    limit ${limit}`
}

/** One episode's lesson as a readable page, for the given guide (or whichever plan exists). */
export async function lessonPage(sql: Sql, episodeId: string, guideId?: string): Promise<string | undefined> {
  const [row] = await sql`
    select e.title, p.title as podcast_title, l.guide_id, l.plan, t.segments, t.words
    from episodes e join podcasts p on p.id = e.podcast_id
    join lesson_plans l on l.episode_id = e.id
    join transcripts t on t.episode_id = e.id
    where e.id = ${episodeId}
    order by (l.guide_id = ${guideId ?? ''}) desc, l.created_at desc
    limit 1`
  if (!row) return undefined
  const reports = await lineReports(sql, episodeId)
  return lessonText({ title: row.title, podcastTitle: row.podcast_title, guideId: row.guide_id, plan: row.plan, transcript: { segments: row.segments, words: row.words }, reports })
}
