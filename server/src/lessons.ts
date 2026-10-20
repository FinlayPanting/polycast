import { lessonText } from '@polycast/core'
import type { Sql } from './db'
import { LINE_REPORT_KIND, lineReports } from './lineReports'

/** Recently prepared episodes that have a lesson plan, ones with reported lines first, then newest first. */
export async function recentLessons(sql: Sql, limit = 30) {
  return sql`
    select e.id, e.title, p.title as podcast_title, e.language, e.ready_at, count(l.guide_id)::int as plans,
      (select count(*)::int from alerts a where a.kind = ${LINE_REPORT_KIND} and a.message::jsonb->>'episodeId' = e.id::text) as reports
    from episodes e join podcasts p on p.id = e.podcast_id join lesson_plans l on l.episode_id = e.id
    where e.status = 'ready'
    group by e.id, p.title
    order by (select count(*) > 0 from alerts a where a.kind = ${LINE_REPORT_KIND} and a.message::jsonb->>'episodeId' = e.id::text) desc, e.ready_at desc nulls last
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
