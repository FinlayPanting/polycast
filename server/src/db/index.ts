import postgres from 'postgres'
import {
  costUSD,
  decidePreparation,
  mayUseGuide,
  weekStartUTC,
  type AccountState,
  type Difficulty,
  type LessonPlan,
  type PrepDecision,
  type Transcript,
  type Usage,
} from '@polycast/core'
import type { SpendLedger } from '../budget'

export type Sql = postgres.Sql

/** Connects as the service role: bypasses row-level security, so only the server holds this. */
export function connect(url: string): Sql {
  return postgres(url, { max: 5, idle_timeout: 20, transform: { undefined: null } })
}

export async function getSetting<T>(sql: Sql | postgres.TransactionSql, key: string, fallback: T): Promise<T> {
  const [row] = await sql`select value from settings where key = ${key}`
  return row ? (row.value as T) : fallback
}

// ---------------------------------------------------------------- spending

export function pgSpendLedger(sql: Sql): SpendLedger {
  return {
    async todayUSD() {
      const [row] = await sql`select coalesce(sum(usd), 0)::float as usd from spend_ledger where day = (now() at time zone 'utc')::date`
      return Number(row!.usd)
    },
    async reserve(jobId, usd) {
      await sql`insert into spend_ledger (job_id, usd) values (${jobId}, ${usd})
                on conflict (job_id) do update set usd = spend_ledger.usd + excluded.usd`
    },
    async settle(jobId, usage) {
      await sql`insert into spend_ledger (job_id, usd) values (${jobId}, ${costUSD(usage)})
                on conflict (job_id) do update set usd = excluded.usd`
    },
  }
}

async function spendCapReached(tx: postgres.TransactionSql): Promise<boolean> {
  const cap = Number(await getSetting(tx, 'daily_cap_usd', 10))
  const [row] = await tx`select coalesce(sum(usd), 0)::float as usd from spend_ledger where day = (now() at time zone 'utc')::date`
  return Number(row!.usd) >= cap
}

// ---------------------------------------------------------------- preparation requests

export type PrepRequestResult =
  | { status: 'ready' }
  | { status: 'queued'; jobId: string; charge: 'none' | 'freeEpisode' | 'plus' }
  | { status: 'refused'; reason: Extract<PrepDecision, { allowed: false }>['reason'] }

const PLUS_PERIOD = "interval '1 month'"

/**
 * A learner asks for an episode. Locks their profile and the episode so two taps, or two learners at
 * once, can't spend the free episode twice or start the same episode twice. The rules themselves live
 * in @polycast/core so the app can explain them in the same words.
 */
export async function requestPreparation(sql: Sql, userId: string, episodeId: string, guideId: string): Promise<PrepRequestResult> {
  return sql.begin(async (tx) => {
    const [profile] = await tx`
      update profiles set
        plus_used_sec = case when plan = 'plus' and (plus_period_start is null or now() >= plus_period_start + ${tx.unsafe(PLUS_PERIOD)}) then 0 else plus_used_sec end,
        plus_period_start = case when plan = 'plus' and (plus_period_start is null or now() >= plus_period_start + ${tx.unsafe(PLUS_PERIOD)}) then now() else plus_period_start end
      where id = ${userId}
      returning plan, signup_rank, free_episode_used, plus_used_sec`
    if (!profile) throw new Error('No such learner')
    const [episode] = await tx`select id, status, duration_sec from episodes where id = ${episodeId} for update`
    if (!episode) throw new Error('No such episode')

    if (episode.status === 'ready') {
      const [plan] = await tx`select 1 from lesson_plans where episode_id = ${episodeId} and guide_id = ${guideId}`
      if (plan) return { status: 'ready' }
      // Ready, but not yet in this learner's chosen guide: a voice-only pass, paid by Polycast.
      return queueJob(tx, episodeId, userId, 'voice', guideId, 'none', 0)
    }

    const [active] = await tx`select id from prep_jobs where episode_id = ${episodeId} and kind = 'prepare' and status in ('queued', 'running')`
    if (active) return { status: 'queued', jobId: active.id as string, charge: 'none' }

    const account: AccountState = {
      plan: profile.plan,
      signupRank: Number(profile.signup_rank),
      freeEpisodeUsed: profile.free_episode_used,
      plusUsedSec: profile.plus_used_sec,
    }
    const decision = decidePreparation(
      account,
      { durationSec: episode.duration_sec, ready: false },
      { freeCohortSize: Number(await getSetting(tx, 'free_cohort_size', 100)), spendCapReached: await spendCapReached(tx) },
    )
    if (!decision.allowed) return { status: 'refused', reason: decision.reason }

    if (decision.charge === 'freeEpisode') await tx`update profiles set free_episode_used = true where id = ${userId}`
    if (decision.charge === 'plus') await tx`update profiles set plus_used_sec = plus_used_sec + ${episode.duration_sec} where id = ${userId}`
    await tx`update episodes set status = 'preparing' where id = ${episodeId}`
    const charged = decision.charge === 'none' ? 0 : episode.duration_sec
    return queueJob(tx, episodeId, userId, 'prepare', guideId, decision.charge, charged)
  })
}

async function queueJob(
  tx: postgres.TransactionSql,
  episodeId: string,
  userId: string,
  kind: 'prepare' | 'voice',
  guideId: string,
  charge: 'none' | 'freeEpisode' | 'plus',
  chargedSec: number,
): Promise<PrepRequestResult> {
  const [existing] = await tx`select id from prep_jobs where episode_id = ${episodeId} and guide_id = ${guideId} and kind = ${kind} and status in ('queued', 'running')`
  if (existing) return { status: 'queued', jobId: existing.id as string, charge: 'none' }
  const [job] = await tx`
    insert into prep_jobs (episode_id, requested_by, kind, guide_id, charge, charged_sec)
    values (${episodeId}, ${userId}, ${kind}, ${guideId}, ${charge}, ${chargedSec})
    returning id`
  return { status: 'queued', jobId: job!.id as string, charge }
}

// ---------------------------------------------------------------- the worker's side

export interface ClaimedJob {
  id: string
  kind: 'prepare' | 'voice'
  episodeId: string
  guideId: string
  attempts: number
}

/** Takes the oldest queued job. SKIP LOCKED lets several workers run without picking the same job. */
export async function claimNextJob(sql: Sql): Promise<ClaimedJob | undefined> {
  const [job] = await sql`
    update prep_jobs set status = 'running', started_at = now(), attempts = attempts + 1
    where id = (select id from prep_jobs where status = 'queued' order by created_at for update skip locked limit 1)
    returning id, kind, episode_id, guide_id, attempts`
  return job ? { id: job.id, kind: job.kind, episodeId: job.episode_id, guideId: job.guide_id, attempts: job.attempts } : undefined
}

export async function setJobStage(sql: Sql, jobId: string, stage: string): Promise<void> {
  await sql`update prep_jobs set stage = ${stage} where id = ${jobId}`
}

export async function completePreparation(
  sql: Sql,
  jobId: string,
  result: { transcript: Transcript; plan: LessonPlan; difficulty: Difficulty; usage: Usage; guideId: string },
): Promise<void> {
  await sql.begin(async (tx) => {
    const [job] = await tx`select episode_id from prep_jobs where id = ${jobId} for update`
    const episodeId = job!.episode_id as string
    if (result.transcript.words.length > 0) {
      await tx`
        insert into transcripts (episode_id, language, native_language, source, words, segments, glossary)
        values (${episodeId}, ${result.transcript.language}, ${result.plan.nativeLanguage}, ${result.transcript.source},
                ${tx.json(result.transcript.words as any)}, ${tx.json(result.transcript.segments as any)}, ${tx.json((result.transcript.glossary ?? {}) as any)})
        on conflict (episode_id) do update set words = excluded.words, segments = excluded.segments, source = excluded.source, glossary = excluded.glossary`
    }
    await tx`
      insert into lesson_plans (episode_id, guide_id, version, plan)
      values (${episodeId}, ${result.guideId}, ${result.plan.version}, ${tx.json(result.plan as any)})
      on conflict (episode_id, guide_id) do update set plan = excluded.plan, version = excluded.version`
    await tx`update episodes set status = 'ready', ready_at = now(), difficulty = ${tx.json(result.difficulty as any)} where id = ${episodeId}`
    await tx`update prep_jobs set status = 'done', stage = 'done', finished_at = now(), cost_usd = ${costUSD(result.usage)} where id = ${jobId}`
  })
}

export const MAX_ATTEMPTS = 3

/**
 * A job failed. It's retried up to three times; after that the learner gets their allowance back
 * (spec: failed processing never charges the allowance) and the episode can be requested again.
 */
export async function failJob(sql: Sql, jobId: string, error: string, retryable: boolean): Promise<'retrying' | 'failed'> {
  return sql.begin(async (tx) => {
    const [job] = await tx`select * from prep_jobs where id = ${jobId} for update`
    if (!job) throw new Error('No such job')
    if (retryable && job.attempts < MAX_ATTEMPTS) {
      await tx`update prep_jobs set status = 'queued', error = ${error} where id = ${jobId}`
      return 'retrying'
    }
    await tx`update prep_jobs set status = 'failed', error = ${error}, finished_at = now() where id = ${jobId}`
    if (job.kind === 'prepare') {
      await tx`update episodes set status = 'none' where id = ${job.episode_id} and status = 'preparing'`
      if (job.charge === 'freeEpisode') await tx`update profiles set free_episode_used = false where id = ${job.requested_by}`
      if (job.charge === 'plus') await tx`update profiles set plus_used_sec = greatest(0, plus_used_sec - ${job.charged_sec}) where id = ${job.requested_by}`
    }
    return 'failed'
  })
}

/** Keeps a finished transcript as soon as it exists, so a retried job can skip transcribing and translating. */
export async function saveTranscript(sql: Sql, episodeId: string, nativeLanguage: string, t: Transcript): Promise<void> {
  await sql`
    insert into transcripts (episode_id, language, native_language, source, words, segments, glossary)
    values (${episodeId}, ${t.language}, ${nativeLanguage}, ${t.source}, ${sql.json(t.words as any)}, ${sql.json(t.segments as any)}, ${sql.json((t.glossary ?? {}) as any)})
    on conflict (episode_id) do update set language = excluded.language, native_language = excluded.native_language,
      source = excluded.source, words = excluded.words, segments = excluded.segments, glossary = excluded.glossary`
}

/** A transcript saved earlier for this episode, translated into the same language, if there is one. */
export async function savedTranscript(sql: Sql, episodeId: string, nativeLanguage: string): Promise<Transcript | undefined> {
  const [row] = await sql`select language, source, words, segments, glossary from transcripts where episode_id = ${episodeId} and native_language = ${nativeLanguage}`
  if (!row || !(row.words as unknown[]).length) return undefined
  return { language: row.language, source: row.source, words: row.words, segments: row.segments, glossary: row.glossary } as Transcript
}

/**
 * Puts a job the worker was running back in the queue without counting the attempt: used when
 * the server shuts down mid-job (every deploy does this), so the next server picks it up.
 */
export async function releaseJob(sql: Sql, jobId: string): Promise<void> {
  await sql`
    update prep_jobs set status = 'queued', attempts = greatest(attempts - 1, 0), error = 'Server restarted mid-job'
    where id = ${jobId} and status = 'running'`
}

/**
 * A job still "running" long after it started belongs to a server that died without releasing it
 * (a crash, or a restart that skipped the shutdown hook). Retry it, or fail it after the last attempt.
 */
export async function reclaimStaleJobs(sql: Sql, olderThanMinutes = STALE_JOB_MINUTES): Promise<number> {
  const stale = await sql`
    select id from prep_jobs where status = 'running' and started_at < now() - make_interval(mins => ${olderThanMinutes})`
  for (const job of stale) await failJob(sql, job.id, `No progress for ${olderThanMinutes} minutes; the server probably restarted`, true)
  return stale.length
}

/** Longer than any real preparation (a 2-hour episode takes about 15 minutes). */
export const STALE_JOB_MINUTES = 60

/** How many of the free cohort have claimed their episode, for Finlay's 50/90/100 alerts. */
export async function freeEpisodesClaimed(sql: Sql): Promise<number> {
  const [row] = await sql`select count(*)::int as n from profiles where free_episode_used`
  return row!.n as number
}

// ---------------------------------------------------------------- listening

/** Whether a learner may hear the guide on this episode, and records the listen if so. */
export async function startListen(sql: Sql, userId: string, episodeId: string, guidanceLevel: string | null): Promise<{ guided: boolean }> {
  return sql.begin(async (tx) => {
    const [profile] = await tx`select plan from profiles where id = ${userId} for update`
    if (!profile) throw new Error('No such learner')
    const [existing] = await tx`select guided from listens where user_id = ${userId} and episode_id = ${episodeId}`
    const week = weekStartUTC(new Date())
    const [count] = await tx`select count(*)::int as n from listens where user_id = ${userId} and guided and started_at >= ${week}`
    const wantsGuide = guidanceLevel !== null
    const guided = wantsGuide && mayUseGuide(profile.plan, count!.n, Boolean(existing?.guided))
    await tx`
      insert into listens (user_id, episode_id, guided, guidance_level) values (${userId}, ${episodeId}, ${guided}, ${guided ? guidanceLevel : null})
      on conflict (user_id, episode_id) do update set guided = listens.guided or excluded.guided, updated_at = now(),
        guidance_level = coalesce(excluded.guidance_level, listens.guidance_level)`
    return { guided }
  })
}
