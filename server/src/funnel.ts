import type { Sql } from './db'

/** The steps of the weekly funnel, in order, with the plain-English label the morning email shows. */
export const FUNNEL_STEPS = [
  ['opened', 'Opened the app for the first time'],
  ['signedUp', 'Signed up'],
  ['pickedLanguage', 'Picked a language'],
  ['startedGuided', 'Started a first guided listen'],
  ['finishedGuided', 'Finished a guided listen'],
  ['usedFreeEpisode', 'Used their free episode'],
  ['startedPlus', 'Started Plus'],
  ['cameBack', 'Came back a week later'],
] as const

export type FunnelStep = (typeof FUNNEL_STEPS)[number][0]
/** Whether the first-listen nudge (PC-1026-09) helps (PC-1027-04): shown after the steps, not as one. */
export interface NudgeCheck {
  /** That week's sign-ups who got the one-time first-listen nudge. */
  firstListenNudged: number
  /** Of those, how many started a guided listen within two days of it. */
  startedWithinTwoDays: number
}

export const NUDGE_WINDOW_DAYS = 2

export type Funnel = { weekStart: string } & Record<FunnelStep, number> & NudgeCheck

/** Counts one first open of the app. No identifier is sent or stored. */
export async function countFirstOpen(sql: Sql): Promise<void> {
  await sql`insert into first_opens (opens) values (1)
            on conflict (day) do update set opens = first_opens.opens + 1`
}

/**
 * The funnel for the people who signed up in the week starting `weekStart` (a Monday, YYYY-MM-DD,
 * UTC). Every later step counts how many of that week's sign-ups have reached it so far, so a week's
 * numbers keep filling in; "came back" needs a listen at least 7 days after signing up.
 * Counts only: no names, emails or ids leave the database.
 */
export async function weeklyFunnel(sql: Sql, weekStart: string): Promise<Funnel> {
  const [opens] = await sql`
    select coalesce(sum(opens), 0)::int as n from first_opens
    where day >= ${weekStart}::date and day < ${weekStart}::date + 7`
  const [row] = await sql`
    with cohort as (
      select * from profiles where created_at >= ${weekStart}::date and created_at < ${weekStart}::date + 7
    )
    select
      count(*)::int as signed_up,
      count(*) filter (where target_language is not null)::int as picked_language,
      count(*) filter (where exists (select 1 from listens l where l.user_id = c.id and l.guided))::int as started_guided,
      count(*) filter (where exists (select 1 from listens l where l.user_id = c.id and l.guided and l.finished_at is not null))::int as finished_guided,
      count(*) filter (where free_episode_used)::int as used_free_episode,
      count(*) filter (where plus_period_start is not null)::int as started_plus,
      count(*) filter (where exists (
        select 1 from listens l where l.user_id = c.id and l.updated_at >= c.created_at + interval '7 days'
      ))::int as came_back,
      count(*) filter (where first_listen_nudged_at is not null)::int as nudged,
      count(*) filter (where first_listen_nudged_at is not null and exists (
        select 1 from listens l where l.user_id = c.id and l.guided
          and l.started_at >= c.first_listen_nudged_at and l.started_at < c.first_listen_nudged_at + make_interval(days => ${NUDGE_WINDOW_DAYS})
      ))::int as nudged_started
    from cohort c`
  return {
    weekStart,
    opened: Number(opens!.n),
    signedUp: row!.signed_up,
    pickedLanguage: row!.picked_language,
    startedGuided: row!.started_guided,
    finishedGuided: row!.finished_guided,
    usedFreeEpisode: row!.used_free_episode,
    startedPlus: row!.started_plus,
    cameBack: row!.came_back,
    firstListenNudged: row!.nudged,
    startedWithinTwoDays: row!.nudged_started,
  }
}

/** The funnel as a few plain lines, each step with the share of the step before it. */
export function funnelText(f: Funnel): string {
  let previous: number | undefined
  const lines = FUNNEL_STEPS.map(([key, label]) => {
    const n = f[key]
    const share = previous ? ` (${Math.round((100 * n) / previous)}%)` : ''
    previous = n
    return `${label}: ${n}${share}`
  })
  const n = f.firstListenNudged
  const nudge = `Got the day-two nudge: ${n}, of whom ${f.startedWithinTwoDays} started a guided listen within two days${n ? ` (${Math.round((100 * f.startedWithinTwoDays) / n)}%)` : ''}`
  return [`Week of ${f.weekStart}`, ...lines, nudge].join('\n')
}
