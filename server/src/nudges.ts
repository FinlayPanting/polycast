/**
 * New-episode nudges (board items PC-1013-08, PC-1022-07): a line from the learner's guide that
 * never leads to a wall.
 * Once a week at most, a learner who finished an episode of a show hears about its newest episode,
 * if it came out after they finished and after their last nudge. Feeds of finished shows are
 * re-read first, through the same safe fetch as everything else.
 */
import { decidePreparation, mayUseGuide, weekStartUTC, type AccountState, type ServiceState } from '@polycast/core'
import { syncFeed, type Fetch } from './catalogue'
import { getSetting, spendCapReached, type Sql } from './db'
import type { LookupHost } from './safeFetch'

export const NUDGE_EVERY_DAYS = 7
/** Shows finished longer ago than this aren't followed up. */
export const NUDGE_SHOWS_FROM_DAYS = 60
/** Sent only in daytime across Europe (UTC hours, inclusive start, exclusive end). */
export const NUDGE_HOURS_UTC = [9, 19] as const

export interface Nudge {
  userId: string
  pushToken: string
  /** The episode the nudge opens: the new one, or one that's already prepared (PC-1022-07). */
  episodeId: string
  podcastTitle: string
  episodeTitle: string
  /** The learner's guide, who writes the line. */
  guideName: string
  kind: NudgeKind
  /** False when the nudge points to an older, already-prepared episode instead of the new one. */
  isNewest: boolean
}

/**
 * What a nudge asks (PC-1022-07). It never invites a learner to something they then can't do:
 * - prepare: the new episode isn't ready, and this learner may get it ready (allowance, Plus hours or free episode).
 * - ready: the episode is ready to play, with the guide.
 * - readyGuideBack: ready to play with subtitles; a free learner has had this week's guided episode,
 *   so the guide says when they're back (Monday, when the week turns over).
 * A learner who could only be offered something they can't do gets no nudge at all.
 */
export type NudgeKind = 'prepare' | 'ready' | 'readyGuideBack'

export function guideNameFor(guideId: string | null | undefined): string {
  return guideId === 'leo' ? 'Leo' : 'Mia'
}

export function nudgeText(n: Pick<Nudge, 'podcastTitle' | 'episodeTitle' | 'guideName' | 'kind'> & Partial<Pick<Nudge, 'isNewest'>>): { title: string; body: string } {
  const g = n.guideName
  if (n.kind === 'prepare') return { title: n.podcastTitle, body: `${g}: A new episode’s out. Shall I get it ready for you?` }
  const what = n.isNewest === false ? `“${n.episodeTitle}” is` : 'The new episode is'
  if (n.kind === 'readyGuideBack') return { title: n.podcastTitle, body: `${g}: ${what} ready to play with subtitles. I’m back to guide you on Monday.` }
  return { title: n.podcastTitle, body: `${g}: ${what} ready when you are. I’ll be there at the pauses.` }
}

export interface NudgeCandidate {
  newest: { id: string; title: string; durationSec: number; status: string }
  /** The newest already-prepared episode of the same show this learner hasn't started, if any. */
  readyFallback?: { id: string; title: string }
  account: AccountState
  guidedThisWeek: number
}

/** Decides which episode a nudge points to, and what it says, or that there's nothing to offer. */
export function planNudge(
  c: NudgeCandidate,
  service: ServiceState,
): { episodeId: string; episodeTitle: string; kind: NudgeKind; isNewest: boolean } | undefined {
  const guideBack = !mayUseGuide(c.account.plan, c.guidedThisWeek, false)
  const ready = (id: string, title: string, isNewest: boolean) =>
    ({ episodeId: id, episodeTitle: title, kind: guideBack ? 'readyGuideBack' : 'ready', isNewest }) as const
  if (c.newest.status === 'ready') return ready(c.newest.id, c.newest.title, true)
  const decision = decidePreparation(
    c.account,
    { durationSec: c.newest.durationSec, ready: false, preparing: c.newest.status === 'preparing' },
    service,
  )
  if (decision.allowed) return { episodeId: c.newest.id, episodeTitle: c.newest.title, kind: 'prepare', isNewest: true }
  if (c.readyFallback) return ready(c.readyFallback.id, c.readyFallback.title, false)
  return undefined
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

interface NudgeRow extends NudgeCandidate {
  userId: string
  pushToken: string
  podcastTitle: string
  guideName: string
  published: Date
}

/** Every learner who is due a nudge, with each finished show's newest unheard episode. */
async function nudgeCandidates(sql: Sql, now: Date): Promise<NudgeRow[]> {
  const rows = await sql`
    with finished as (
      select l.user_id, e.podcast_id, max(l.finished_at) as finished_at
      from listens l join episodes e on e.id = l.episode_id
      where l.finished_at > now() - make_interval(days => ${NUDGE_SHOWS_FROM_DAYS})
      group by l.user_id, e.podcast_id
    ),
    newest as (
      select distinct on (pr.id, p.id) pr.id as user_id, p.id as podcast_id, pr.push_token, pr.guide_id, pr.plan, pr.signup_rank,
        pr.free_episode_used,
        case when pr.plus_period_start is null or now() >= pr.plus_period_start + interval '1 month' then 0 else pr.plus_used_sec end as plus_used_sec,
        e.id as episode_id, e.title as episode_title, e.duration_sec, e.status, e.published, p.title as podcast_title
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
      order by pr.id, p.id, e.published desc
    )
    select n.*,
      (select count(*)::int from listens g where g.user_id = n.user_id and g.guided and g.guided_at >= ${weekStartUTC(now)}) as guided_this_week,
      fb.id as fallback_id, fb.title as fallback_title
    from newest n
    left join lateral (
      select r.id, r.title from episodes r
      where r.podcast_id = n.podcast_id and r.status = 'ready'
        and not exists (select 1 from listens l3 where l3.user_id = n.user_id and l3.episode_id = r.id)
      order by r.published desc limit 1
    ) fb on true`
  return rows.map((r) => ({
    userId: r.user_id,
    pushToken: r.push_token,
    podcastTitle: r.podcast_title,
    guideName: guideNameFor(r.guide_id),
    published: r.published,
    newest: { id: r.episode_id, title: r.episode_title, durationSec: Number(r.duration_sec ?? 0), status: r.status },
    readyFallback: r.fallback_id ? { id: r.fallback_id, title: r.fallback_title } : undefined,
    account: { plan: r.plan, signupRank: Number(r.signup_rank), freeEpisodeUsed: r.free_episode_used, plusUsedSec: Number(r.plus_used_sec) },
    guidedThisWeek: r.guided_this_week,
  }))
}

/**
 * One nudge per learner who is due one, about a show they finished. Shows whose newest episode can
 * be offered come first (newest first); a learner with nothing they could act on isn't nudged.
 */
export async function dueNudges(sql: Sql, now = new Date()): Promise<Nudge[]> {
  const service: ServiceState = {
    freeCohortSize: Number(await getSetting(sql, 'free_cohort_size', 100)),
    spendCapReached: await spendCapReached(sql),
  }
  const byUser = new Map<string, Nudge & { published: number }>()
  for (const c of await nudgeCandidates(sql, now)) {
    const plan = planNudge(c, service)
    if (!plan) continue
    const nudge = {
      userId: c.userId,
      pushToken: c.pushToken,
      podcastTitle: c.podcastTitle,
      guideName: c.guideName,
      episodeId: plan.episodeId,
      episodeTitle: plan.episodeTitle,
      kind: plan.kind,
      isNewest: plan.isNewest,
      published: new Date(c.published).getTime() + (plan.isNewest ? 0 : -1e15),
    }
    const seen = byUser.get(c.userId)
    if (!seen || nudge.published > seen.published) byUser.set(c.userId, nudge)
  }
  return [...byUser.values()].map(({ published: _p, ...n }) => n)
}

export type Push = (to: string, title: string, body: string, data: Record<string, string>) => Promise<void>

/** Sends what's due and records it, so nobody hears twice in a week. Returns how many went out. */
export async function sendNudges(sql: Sql, push: Push, now = new Date()): Promise<number> {
  const hour = now.getUTCHours()
  if (hour < NUDGE_HOURS_UTC[0] || hour >= NUDGE_HOURS_UTC[1]) return 0
  let sent = 0
  for (const n of await dueNudges(sql, now)) {
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
