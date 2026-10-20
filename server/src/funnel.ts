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
/** Plus screen counts (PC-1018-08): times it was opened that week, and times it closed without a purchase. */
export interface PlusScreen {
  opens: number
  leftWithoutBuying: number
}
export type Funnel = { weekStart: string; plusScreen: PlusScreen } & Record<FunnelStep, number>

/** Counts one first open of the app. No identifier is sent or stored. */
export async function countFirstOpen(sql: Sql): Promise<void> {
  await sql`insert into first_opens (opens) values (1)
            on conflict (day) do update set opens = first_opens.opens + 1`
}

export type PlusScreenEvent = 'opened' | 'left'

/** Counts one opening of the Plus screen, or one closing without buying. No identifier is sent or stored. */
export async function countPlusScreen(sql: Sql, event: PlusScreenEvent): Promise<void> {
  if (event === 'opened')
    await sql`insert into plus_screen_views (opens) values (1)
              on conflict (day) do update set opens = plus_screen_views.opens + 1`
  else
    await sql`insert into plus_screen_views (left_without_buying) values (1)
              on conflict (day) do update set left_without_buying = plus_screen_views.left_without_buying + 1`
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
  const [plus] = await sql`
    select coalesce(sum(opens), 0)::int as opens, coalesce(sum(left_without_buying), 0)::int as left
    from plus_screen_views
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
      ))::int as came_back
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
    plusScreen: { opens: Number(plus!.opens), leftWithoutBuying: Number(plus!.left) },
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
  // Everyone's visits that week, not just the week's sign-ups: tells 'nobody saw the offer' from 'saw it and said no'.
  const { opens, leftWithoutBuying } = f.plusScreen
  const plus = `Plus screen (everyone that week): opened ${opens} ${opens === 1 ? 'time' : 'times'}, closed without buying ${leftWithoutBuying}${opens ? ` (${Math.round((100 * leftWithoutBuying) / opens)}%)` : ''}`
  return [`Week of ${f.weekStart}`, ...lines, plus].join('\n')
}
