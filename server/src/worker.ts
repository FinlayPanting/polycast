import { costUSD, recurringNames, wordsFromPodcastJson, type ShowNames, pickTimedTranscript, parseFeed, type LessonPlan } from '@polycast/core'
import { SpendCapReached, SpendGuard } from './budget'
import { claimNextJob, completePreparation, failJob, queueSyncUpgrades, reclaimStaleJobs, saveTranscript, savedTranscript, pgSpendLedger, getSetting, setJobStage, type ClaimedJob, type Sql } from './db'
import { EmptyTranscript, prepareEpisode, syncPath, voiceForGuide, type PrepareDeps } from './pipeline/prepare'
import { ProviderError } from './providers/types'
import { guideById } from './voices'
import { ensureWelcomeAudio } from './welcome'

export interface WorkerDeps extends Omit<PrepareDeps, 'guard' | 'onStage'> {
  sql: Sql
  fetch: typeof fetch
  /** Tells the learner their episode is ready (Expo push). */
  notifyReady?: (userId: string, episodeTitle: string, episodeId: string) => Promise<void>
  alert?: (kind: string, message: string) => Promise<void>
}

async function guard(deps: WorkerDeps): Promise<SpendGuard> {
  const cap = Number(await getSetting(deps.sql, 'daily_cap_usd', 10))
  return new SpendGuard(pgSpendLedger(deps.sql), cap, (c) => deps.alert?.('spend-cap', `Daily spending cap of $${c} reached; new episodes paused until tomorrow (UTC).`))
}

/** Looks for a word-timed transcript in the episode's feed, so transcription can be skipped. */
async function feedWordsFor(deps: WorkerDeps, feedUrl: string, guid: string, language: string) {
  try {
    const feed = parseFeed(await (await deps.fetch(feedUrl)).text())
    const link = pickTimedTranscript(feed.episodes.find((e) => e.guid === guid)?.transcripts ?? [], language)
    if (!link?.type.includes('json')) return undefined
    return wordsFromPodcastJson(await (await deps.fetch(link.url)).json())
  } catch {
    return undefined
  }
}

/** The show's title, its hosts (the feed's author) and names that recur in its episode titles. */
export async function showNamesFor(sql: Sql, podcastId: string): Promise<ShowNames> {
  const [p] = await sql`select title, author from podcasts where id = ${podcastId}`
  const titles = await sql`select title from episodes where podcast_id = ${podcastId} order by published desc nulls last limit 100`
  const hosts = String(p?.author ?? '')
    .split(/\s*(?:,|&|\+|\boch\b|\bund\b|\band\b|\bet\b|\by\b|\be\b)\s*/i)
    .map((h) => h.trim())
    .filter((h) => h.length > 1)
  return { showTitle: p?.title ?? '', hosts, names: recurringNames(titles.map((t) => t.title as string)) }
}

export async function runJob(deps: WorkerDeps, job: ClaimedJob): Promise<'done' | 'retrying' | 'failed'> {
  const { sql } = deps
  const [ep] = await sql`select e.*, p.feed_url from episodes e join podcasts p on p.id = e.podcast_id where e.id = ${job.episodeId}`
  const guide = guideById(job.guideId)
  try {
    const g = await guard(deps)
    if (job.kind === 'voice') {
      const [row] = await sql`select plan from lesson_plans where episode_id = ${job.episodeId} limit 1`
      const { plan, usage } = await voiceForGuide(job.id, row!.plan as LessonPlan, guide, ep!.duration_sec, { ...deps, guard: g })
      await sql`insert into lesson_plans (episode_id, guide_id, version, plan) values (${job.episodeId}, ${guide.id}, ${plan.version}, ${sql.json(plan as any)})
                on conflict (episode_id, guide_id) do update set plan = excluded.plan`
      await sql`update prep_jobs set status = 'done', finished_at = now(), cost_usd = ${costUSD(usage)} where id = ${job.id}`
      return 'done'
    }
    const [requester] = await sql`select native_language from profiles p join prep_jobs j on j.requested_by = p.id where j.id = ${job.id}`
    const nativeLanguage: string = requester?.native_language ?? 'en'
    const saved = await savedTranscript(sql, job.episodeId, nativeLanguage)
    const result = await prepareEpisode(
      {
        jobId: job.id,
        episodeId: job.episodeId,
        audioUrl: ep!.audio_url,
        durationSec: ep!.duration_sec,
        language: ep!.language,
        nativeLanguage,
        guide,
        feedWords: saved ? undefined : await feedWordsFor(deps, ep!.feed_url, ep!.guid, ep!.language),
        savedTranscript: saved,
        savedSyncUrl: saved ? await deps.storage.exists?.(syncPath(job.episodeId)) : undefined,
        names: saved ? undefined : await showNamesFor(sql, ep!.podcast_id),
      },
      {
        ...deps,
        guard: g,
        onStage: (s) => setJobStage(sql, job.id, s),
        saveTranscript: (t) => saveTranscript(sql, job.episodeId, nativeLanguage, t),
      },
    )
    await completePreparation(sql, job.id, { ...result, guideId: guide.id })
    // Everyone waiting on this episode hears it's ready.
    const waiting = await sql`select distinct requested_by from prep_jobs where episode_id = ${job.episodeId} and requested_by is not null`
    for (const w of waiting) await deps.notifyReady?.(w.requested_by, ep!.title, job.episodeId).catch(() => {})
    return 'done'
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const retryable = e instanceof ProviderError ? e.retryable : !(e instanceof EmptyTranscript || e instanceof SpendCapReached)
    if (e instanceof ProviderError && e.status === 429 && !e.retryable) {
      await deps.alert?.('quota', `A provider's daily limit stopped an episode: ${message.slice(0, 200)}`).catch(() => {})
    }
    return failJob(sql, job.id, message, retryable)
  }
}

let currentJob: string | undefined

/** The job this process is working on, so shutdown can hand it back to the queue. */
export function jobInProgress(): string | undefined {
  return currentJob
}

/** Runs queued jobs until stopped, polling when the queue is empty. */
export async function workLoop(deps: WorkerDeps, opts: { pollMs?: number; signal?: AbortSignal } = {}): Promise<void> {
  const poll = opts.pollMs ?? 3000
  let lastReclaim = 0
  const upgraded = await queueSyncUpgrades(deps.sql).catch((e) => (console.error('worker: sync upgrade check failed', e), 0))
  if (upgraded) console.log(`worker: preparing ${upgraded} older episode(s) again so they follow each listener's adverts`)
  // The guide's welcome, voiced once per language before anyone hears it.
  await guard(deps)
    .then((g) => ensureWelcomeAudio({ speech: deps.speech, storage: deps.storage, guard: g, log: console.log }))
    .then((v) => v.length && console.log(`worker: voiced the welcome for ${v.join(', ')}`))
    .catch((e) => console.error('worker: welcome voicing failed', e instanceof Error ? e.message : e))
  while (!opts.signal?.aborted) {
    try {
      if (Date.now() - lastReclaim > 60_000) {
        lastReclaim = Date.now()
        const n = await reclaimStaleJobs(deps.sql)
        if (n) console.log(`worker: put ${n} abandoned job(s) back in the queue`)
      }
      const job = await claimNextJob(deps.sql)
      if (!job) {
        await new Promise((r) => setTimeout(r, poll))
        continue
      }
      currentJob = job.id
      const outcome = await runJob(deps, job).finally(() => (currentJob = undefined))
      console.log(`job ${job.id} (${job.kind}) → ${outcome}`)
    } catch (err) {
      // A database hiccup (or a database not yet set up) must not take the API down with it.
      console.error('worker: could not claim or run a job, retrying shortly', err instanceof Error ? err.message : err)
      await new Promise((r) => setTimeout(r, Math.max(poll, 10_000)))
    }
  }
}
