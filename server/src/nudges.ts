/**
 * "New Alex & Sigges is out. Get it ready?" (board item PC-1013-08).
 * Once a week at most, a learner who finished an episode of a show hears about its newest episode,
 * if it came out after they finished and after their last nudge. Feeds of finished shows are
 * re-read first, through the same safe fetch as everything else.
 */
import { syncFeed, type Fetch } from './catalogue'
import type { Sql } from './db'
import type { LookupHost } from './safeFetch'

export const NUDGE_EVERY_DAYS = 7
/** Shows finished longer ago than this aren't followed up. */
export const NUDGE_SHOWS_FROM_DAYS = 60
/** Sent only in daytime across Europe (UTC hours, inclusive start, exclusive end). */
export const NUDGE_HOURS_UTC = [9, 19] as const

export interface Nudge {
  userId: string
  pushToken: string
  episodeId: string
  podcastTitle: string
  episodeTitle: string
}

export function nudgeText(n: Pick<Nudge, 'podcastTitle'>): { title: string; body: string } {
  return { title: n.podcastTitle, body: `New ${n.podcastTitle} is out. Get it ready?` }
}

/** Re-reads the feeds of shows learners finished recently, so new episodes are known. Failures are skipped. */
export async function refreshFinishedShows(sql: Sql, f: Fetch, opts: { lookupHost?: LookupHost } = {}): Promise<number> {
  const shows = await sql<{ feed_url: string }[]>`
    select distinct p.feed_url from listens l
    join episodes e on e.id = l.episode_id join podcasts p on p.id = e.podcast_id
    where l.finished_at > now() - make_interval(days => ${NUDGE_SHOWS_FROM_DAYS}) and not p.removed`
  let synced = 0
  for (const { feed_url } of shows) {
    try {
      await syncFeed(sql, f, feed_url, undefined, opts)
      synced++
    } catch (e) {
      console.error('nudge feed refresh failed', feed_url, e)
    }
  }
  return synced
}

/** One nudge per learner who is due one: the newest unheard episode of a show they finished. */
export async function dueNudges(sql: Sql): Promise<Nudge[]> {
  const rows = await sql`
    with finished as (
      select l.user_id, e.podcast_id, max(l.finished_at) as finished_at
      from listens l join episodes e on e.id = l.episode_id
      where l.finished_at > now() - make_interval(days => ${NUDGE_SHOWS_FROM_DAYS})
      group by l.user_id, e.podcast_id
    )
    select distinct on (pr.id) pr.id as user_id, pr.push_token, e.id as episode_id, e.title as episode_title, p.title as podcast_title
    from finished f
    join profiles pr on pr.id = f.user_id
    join podcasts p on p.id = f.podcast_id and not p.removed
    join episodes e on e.podcast_id = f.podcast_id
    where pr.push_token is not null
      and (pr.last_nudged_at is null or pr.last_nudged_at < now() - make_interval(days => ${NUDGE_EVERY_DAYS}))
      and e.published > f.finished_at
      and e.published > coalesce(pr.last_nudged_at, '-infinity')
      and e.published > now() - make_interval(days => ${NUDGE_EVERY_DAYS})
      and not exists (select 1 from listens l2 where l2.user_id = pr.id and l2.episode_id = e.id)
    order by pr.id, e.published desc`
  return rows.map((r) => ({ userId: r.user_id, pushToken: r.push_token, episodeId: r.episode_id, podcastTitle: r.podcast_title, episodeTitle: r.episode_title }))
}

export type Push = (to: string, title: string, body: string, data: Record<string, string>) => Promise<void>

/** Sends what's due and records it, so nobody hears twice in a week. Returns how many went out. */
export async function sendNudges(sql: Sql, push: Push, now = new Date()): Promise<number> {
  const hour = now.getUTCHours()
  if (hour < NUDGE_HOURS_UTC[0] || hour >= NUDGE_HOURS_UTC[1]) return 0
  let sent = 0
  for (const n of await dueNudges(sql)) {
    // Mark first: a failed push loses one nudge rather than risking two.
    const [claimed] = await sql`update profiles set last_nudged_at = now() where id = ${n.userId}
      and (last_nudged_at is null or last_nudged_at < now() - make_interval(days => ${NUDGE_EVERY_DAYS})) returning id`
    if (!claimed) continue
    const { title, body } = nudgeText(n)
    try {
      await push(n.pushToken, title, body, { episodeId: n.episodeId })
      sent++
    } catch (e) {
      console.error('nudge push failed', e)
    }
  }
  return sent
}
