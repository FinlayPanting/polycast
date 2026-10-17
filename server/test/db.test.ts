/**
 * Runs against a real Postgres when PG_TEST_URL points at an empty server, e.g.
 *   PG_TEST_URL=postgres://postgres@localhost:54329/postgres?host=/tmp
 * Each run creates and drops its own database.
 */
import { randomUUID } from 'node:crypto'
import type postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  claimNextJob,
  completePreparation,
  failJob,
  freeEpisodesClaimed,
  queueSyncUpgrades,
  reclaimStaleJobs,
  releaseJob,
  saveTranscript,
  savedTranscript,
  pgSpendLedger,
  requestPreparation,
  startListen,
  type Sql,
} from '../src/db'
import { freshDatabase, PG_TEST_URL } from './pg'
import { LESSON_PLAN_VERSION } from '@polycast/core'

const run = PG_TEST_URL ? describe : describe.skip

run('database', () => {
  let sql: Sql
  let drop: () => Promise<void>

  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
  })

  afterAll(async () => {
    await drop?.()
  })

  beforeEach(async () => {
    await sql`truncate prep_jobs, spend_ledger, listens, saved_words, lesson_plans, transcripts, episodes, podcasts cascade`
    await sql`update settings set value = '100' where key = 'free_cohort_size'`
    await sql`update settings set value = '10' where key = 'daily_cap_usd'`
  })

  async function learner(): Promise<string> {
    const id = randomUUID()
    await sql`insert into auth.users (id) values (${id})`
    return id
  }

  async function episode(durationSec = 1800): Promise<string> {
    const [p] = await sql`insert into podcasts (feed_url, title, language) values (${`https://f/${randomUUID()}`}, 'Svenska Samtal', 'sv') returning id`
    const [e] = await sql`insert into episodes (podcast_id, guid, title, duration_sec, audio_url, language)
                          values (${p!.id}, ${randomUUID()}, 'Tåget', ${durationSec}, 'https://cdn/a.mp3', 'sv') returning id`
    return e!.id as string
  }

  /** Runs queries as a signed-in learner, with row-level security on. */
  function asLearner<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    return sql.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`
      return fn(tx)
    }) as Promise<T>
  }

  const fakeResult = (episodeId: string, guideId = 'mia') => ({
    transcript: { language: 'sv', source: 'scribe' as const, words: [{ text: 'Hej', start: 0, end: 0.4 }], segments: [] },
    plan: { episodeId, version: LESSON_PLAN_VERSION, targetLanguage: 'sv', nativeLanguage: 'en', hosts: [], summary: '', moments: [], wrapUpQuestions: [] },
    difficulty: { wpm: 150, band: 'moderate' as const, label: 'B1–B2, natural pace' },
    usage: { transcriptionSec: 1800, textInTokens: 1000, textOutTokens: 500, ttsAudioSec: 300 },
    guideId,
  })

  describe('accounts', () => {
    it('numbers learners in sign-up order', async () => {
      const a = await learner()
      const b = await learner()
      const [ra] = await sql`select signup_rank from profiles where id = ${a}`
      const [rb] = await sql`select signup_rank from profiles where id = ${b}`
      expect(Number(rb!.signup_rank)).toBe(Number(ra!.signup_rank) + 1)
    })
  })

  describe('row-level security', () => {
    it('lets a learner change their own preferences but not their plan or allowances', async () => {
      const a = await learner()
      await asLearner(a, (tx) => tx`update profiles set guide_id = 'leo' where id = ${a}`)
      const [p] = await sql`select guide_id from profiles where id = ${a}`
      expect(p!.guide_id).toBe('leo')
      await expect(asLearner(a, (tx) => tx`update profiles set plan = 'plus' where id = ${a}`)).rejects.toThrow(/permission denied/)
      await expect(asLearner(a, (tx) => tx`update profiles set free_episode_used = false where id = ${a}`)).rejects.toThrow(/permission denied/)
    })

    it("keeps each learner's profile, words and listens private", async () => {
      const a = await learner()
      const b = await learner()
      const ep = await episode()
      await sql`insert into saved_words (user_id, language, lemma, meaning, clip, review) values (${b}, 'sv', 'fika', 'coffee break', '{}', '{}')`
      const words = await asLearner(a, (tx) => tx`select * from saved_words`)
      const profiles = await asLearner(a, (tx) => tx`select id from profiles`)
      expect(words).toHaveLength(0)
      expect(profiles.map((r) => r.id)).toEqual([a])
      await expect(asLearner(a, (tx) => tx`insert into saved_words (user_id, language, lemma, meaning, clip, review) values (${b}, 'sv', 'x', 'x', '{}', '{}')`)).rejects.toThrow(/row-level security/)
      // Listens start on the server (it checks the guide allowance); the learner only moves along them.
      await expect(asLearner(a, (tx) => tx`insert into listens (user_id, episode_id, guided) values (${a}, ${ep}, true)`)).rejects.toThrow(/permission denied/)
      await sql`insert into listens (user_id, episode_id, guided) values (${a}, ${ep}, true), (${b}, ${ep}, false)`
      await asLearner(a, (tx) => tx`update listens set position_sec = 42, updated_at = now(), finished_at = now() where user_id = ${a} and episode_id = ${ep}`)
      expect((await sql`select position_sec from listens where user_id = ${a}`)[0]!.position_sec).toBe(42)
      expect(await asLearner(a, (tx) => tx`select user_id from listens`)).toEqual([{ user_id: a }])
      await expect(asLearner(a, (tx) => tx`update listens set guided = false where user_id = ${a}`)).rejects.toThrow(/permission denied/)
      await expect(asLearner(a, (tx) => tx`delete from listens where user_id = ${a}`)).rejects.toThrow(/permission denied/)
      await expect(asLearner(a, (tx) => tx`select * from lesson_plans`)).rejects.toThrow(/permission denied/)
      await expect(asLearner(a, (tx) => tx`select * from transcripts`)).rejects.toThrow(/permission denied/)
    })

    it('lets learners read the catalogue but never write it, and hides removed shows', async () => {
      const a = await learner()
      const ep = await episode()
      expect(await asLearner(a, (tx) => tx`select id from episodes`)).toHaveLength(1)
      await expect(asLearner(a, (tx) => tx`update episodes set status = 'ready' where id = ${ep}`)).rejects.toThrow(/permission denied/)
      await sql`update podcasts set removed = true`
      expect(await asLearner(a, (tx) => tx`select id from episodes`)).toHaveLength(0)
    })

    it('keeps settings and spending away from learners', async () => {
      const a = await learner()
      await expect(asLearner(a, (tx) => tx`select * from settings`)).rejects.toThrow(/permission denied/)
      await expect(asLearner(a, (tx) => tx`select * from spend_ledger`)).rejects.toThrow(/permission denied/)
    })
  })

  describe('requesting episodes', () => {
    it('spends the free episode once, and only once even with two taps at the same moment', async () => {
      const a = await learner()
      const [e1, e2] = [await episode(), await episode()]
      const results = await Promise.all([requestPreparation(sql, a, e1, 'mia'), requestPreparation(sql, a, e2, 'mia')])
      expect(results.map((r) => r.status).sort()).toEqual(['queued', 'refused'])
      expect(results.find((r) => r.status === 'refused')).toEqual({ status: 'refused', reason: 'free-used' })
      expect(await freeEpisodesClaimed(sql)).toBe(1)
    })

    it('lets a second learner join an episode already being prepared, at no charge', async () => {
      const [a, b] = [await learner(), await learner()]
      const ep = await episode()
      const first = await requestPreparation(sql, a, ep, 'mia')
      const second = await requestPreparation(sql, b, ep, 'mia')
      expect(second).toEqual({ status: 'queued', jobId: (first as any).jobId, charge: 'none' })
      const [pb] = await sql`select free_episode_used from profiles where id = ${b}`
      expect(pb!.free_episode_used).toBe(false)
    })

    it('closes the free episode after the cohort, until Finlay raises it', async () => {
      await sql`update settings set value = '0' where key = 'free_cohort_size'`
      const a = await learner()
      const ep = await episode()
      expect(await requestPreparation(sql, a, ep, 'mia')).toEqual({ status: 'refused', reason: 'free-closed' })
      await sql`update settings set value = '100000' where key = 'free_cohort_size'`
      expect((await requestPreparation(sql, a, ep, 'mia')).status).toBe('queued')
    })

    it('refuses episodes over 2 hours on the free episode', async () => {
      const a = await learner()
      expect(await requestPreparation(sql, a, await episode(7201), 'mia')).toEqual({ status: 'refused', reason: 'too-long' })
    })

    it('counts Plus hours and pauses everyone at the daily cap', async () => {
      const a = await learner()
      await sql`update profiles set plan = 'plus', plus_period_start = now(), plus_used_sec = ${4.5 * 3600} where id = ${a}`
      expect(await requestPreparation(sql, a, await episode(3600), 'mia')).toEqual({ status: 'refused', reason: 'plus-limit' })
      expect((await requestPreparation(sql, a, await episode(600), 'mia')).status).toBe('queued')

      await pgSpendLedger(sql).reserve('other', 10)
      const b = await learner()
      expect(await requestPreparation(sql, b, await episode(), 'mia')).toEqual({ status: 'refused', reason: 'service-paused' })
    })

    it('resets Plus hours when a new month of the subscription starts', async () => {
      const a = await learner()
      await sql`update profiles set plan = 'plus', plus_period_start = now() - interval '32 days', plus_used_sec = ${5 * 3600} where id = ${a}`
      expect((await requestPreparation(sql, a, await episode(3600), 'mia')).status).toBe('queued')
      const [p] = await sql`select plus_used_sec from profiles where id = ${a}`
      expect(p!.plus_used_sec).toBe(3600)
    })
  })

  describe('the worker', () => {
    it('hands each queued job to exactly one worker', async () => {
      const [a, b] = [await learner(), await learner()]
      await requestPreparation(sql, a, await episode(), 'mia')
      await requestPreparation(sql, b, await episode(), 'mia')
      const claims = await Promise.all([claimNextJob(sql), claimNextJob(sql), claimNextJob(sql)])
      const ids = claims.filter(Boolean).map((c) => c!.id)
      expect(ids).toHaveLength(2)
      expect(new Set(ids).size).toBe(2)
    })

    it('marks an episode ready, then serves it free and voices it again for the other guide', async () => {
      const [a, b] = [await learner(), await learner()]
      const ep = await episode()
      await requestPreparation(sql, a, ep, 'mia')
      const job = (await claimNextJob(sql))!
      await completePreparation(sql, job.id, fakeResult(ep))
      const [e] = await sql`select status, difficulty from episodes where id = ${ep}`
      expect(e!.status).toBe('ready')
      expect(await requestPreparation(sql, b, ep, 'mia')).toEqual({ status: 'ready' })
      const leo = await requestPreparation(sql, b, ep, 'leo')
      expect(leo).toMatchObject({ status: 'queued', charge: 'none' })
      const [pb] = await sql`select free_episode_used from profiles where id = ${b}`
      expect(pb!.free_episode_used).toBe(false)
    })

    it('retries a failed job, then gives the learner their free episode back', async () => {
      const a = await learner()
      const ep = await episode()
      await requestPreparation(sql, a, ep, 'mia')
      for (let i = 1; i <= 3; i++) {
        const job = (await claimNextJob(sql))!
        expect(job.attempts).toBe(i)
        expect(await failJob(sql, job.id, 'Gemini returned 503', true)).toBe(i < 3 ? 'retrying' : 'failed')
      }
      const [p] = await sql`select free_episode_used from profiles where id = ${a}`
      const [e] = await sql`select status from episodes where id = ${ep}`
      expect(p!.free_episode_used).toBe(false)
      expect(e!.status).toBe('none')
    })

    it('hands an unfinished job back when the server shuts down, without using up an attempt', async () => {
      const ep = await episode()
      await requestPreparation(sql, await learner(), ep, 'mia')
      const job = (await claimNextJob(sql))!
      await releaseJob(sql, job.id)
      const again = (await claimNextJob(sql))!
      expect(again.id).toBe(job.id)
      expect(again.attempts).toBe(1)
    })

    it('keeps a transcript for a retry, but only for the same translation language', async () => {
      const ep = await episode()
      const t = { language: 'sv', source: 'scribe' as const, words: [{ text: 'hej', start: 0, end: 0.4 }], segments: [], glossary: {} }
      expect(await savedTranscript(sql, ep, 'en')).toBeUndefined()
      await saveTranscript(sql, ep, 'en', t as any)
      expect((await savedTranscript(sql, ep, 'en'))?.words).toEqual(t.words)
      expect(await savedTranscript(sql, ep, 'de')).toBeUndefined()
    })

    it('prepares older episodes once more, free, so they can follow each listener\'s adverts', async () => {
      const [a, b] = [await learner(), await learner()]
      const [old, fresh] = [await episode(), await episode()]
      await requestPreparation(sql, a, old, 'leo')
      await requestPreparation(sql, b, fresh, 'leo')
      for (const ep of [old, fresh]) {
        const [job] = await sql`select id from prep_jobs where episode_id = ${ep}`
        const result = fakeResult(ep, 'leo')
        if (ep === fresh) (result.plan as any).syncUrl = 'https://s/sync.fp'
        await sql`update prep_jobs set status = 'running' where id = ${job!.id}`
        await completePreparation(sql, job!.id, result)
      }
      await queueSyncUpgrades(sql)
      const [o] = await sql`select status from episodes where id = ${old}`
      const [f] = await sql`select status from episodes where id = ${fresh}`
      expect(o!.status).toBe('preparing')
      expect(f!.status).toBe('ready')
      expect(await sql`select 1 from transcripts where episode_id = ${old}`).toHaveLength(0)
      const [job] = await sql`select charge, guide_id, requested_by from prep_jobs where episode_id = ${old} and status = 'queued'`
      expect(job).toMatchObject({ charge: 'none', guide_id: 'leo', requested_by: a })
      expect(await queueSyncUpgrades(sql)).toBe(0) // once only
    })

    it('rewrites plans from an older version, keeping the transcript', async () => {
      const a = await learner()
      const ep = await episode()
      await requestPreparation(sql, a, ep, 'mia')
      const [job] = await sql`select id from prep_jobs where episode_id = ${ep}`
      const result = fakeResult(ep, 'mia')
      ;(result.plan as any).syncUrl = 'https://s/sync.fp'
      result.plan.version = LESSON_PLAN_VERSION - 1
      await sql`update prep_jobs set status = 'running' where id = ${job!.id}`
      await completePreparation(sql, job!.id, result)
      expect(await queueSyncUpgrades(sql)).toBe(1)
      const [e] = await sql`select status from episodes where id = ${ep}`
      expect(e!.status).toBe('preparing')
      expect(await sql`select 1 from transcripts where episode_id = ${ep}`).toHaveLength(1)
      expect(await sql`select 1 from lesson_plans where episode_id = ${ep}`).toHaveLength(0)
      const [queued] = await sql`select charge, guide_id, requested_by from prep_jobs where episode_id = ${ep} and status = 'queued'`
      expect(queued).toMatchObject({ charge: 'none', guide_id: 'mia', requested_by: a })
      expect(await queueSyncUpgrades(sql)).toBe(0)
    })

    it("keeps Polycast's re-plans in their own lane, apart from learners' requests", async () => {
      const a = await learner()
      const ep = await episode()
      await requestPreparation(sql, a, ep, 'mia')
      const [job] = await sql`select id from prep_jobs where episode_id = ${ep}`
      const result = fakeResult(ep, 'mia')
      ;(result.plan as any).syncUrl = 'https://s/sync.fp'
      result.plan.version = LESSON_PLAN_VERSION - 1
      await sql`update prep_jobs set status = 'running' where id = ${job!.id}`
      await completePreparation(sql, job!.id, result)
      await queueSyncUpgrades(sql)
      const fresh = await episode()
      await requestPreparation(sql, await learner(), fresh, 'mia')

      const learnerJob = (await claimNextJob(sql, 'learners'))!
      expect(learnerJob.episodeId).toBe(fresh)
      expect(learnerJob.background).toBe(false)
      expect(await claimNextJob(sql, 'learners')).toBeUndefined()
      const replan = (await claimNextJob(sql, 'background'))!
      expect(replan.episodeId).toBe(ep)
      expect(replan.background).toBe(true)
      expect(await claimNextJob(sql, 'background')).toBeUndefined()
    })

    it('leaves a voice pass for a second guide with the learners, though Polycast pays for it', async () => {
      const [a, b] = [await learner(), await learner()]
      const ep = await episode()
      await requestPreparation(sql, a, ep, 'mia')
      await completePreparation(sql, (await claimNextJob(sql))!.id, fakeResult(ep))
      await requestPreparation(sql, b, ep, 'leo')
      expect(await claimNextJob(sql, 'background')).toBeUndefined()
      expect((await claimNextJob(sql, 'learners'))!.kind).toBe('voice')
    })

    it('picks up a job a dead server left running, and gives up after the last attempt', async () => {
      const a = await learner()
      const ep = await episode()
      await requestPreparation(sql, a, ep, 'mia')
      const job = (await claimNextJob(sql))!
      expect(await reclaimStaleJobs(sql)).toBe(0) // still fresh: leave it alone
      for (let i = 1; i <= 3; i++) {
        await sql`update prep_jobs set started_at = now() - interval '2 hours' where id = ${job.id}`
        expect(await reclaimStaleJobs(sql)).toBe(1)
        if (i < 3) expect((await claimNextJob(sql))!.attempts).toBe(i + 1)
      }
      const [j] = await sql`select status from prep_jobs where id = ${job.id}`
      const [p] = await sql`select free_episode_used from profiles where id = ${a}`
      expect(j!.status).toBe('failed')
      expect(p!.free_episode_used).toBe(false)
    })
  })

  describe('the guide on free listens', () => {
    it('gives a free learner one guided episode a week, and keeps it guided on replay', async () => {
      const a = await learner()
      const [e1, e2] = [await episode(), await episode()]
      expect(await startListen(sql, a, e1, 'standard')).toEqual({ guided: true })
      expect(await startListen(sql, a, e2, 'standard')).toEqual({ guided: false })
      expect(await startListen(sql, a, e1, 'standard')).toEqual({ guided: true })
      expect(await startListen(sql, a, e2, null)).toEqual({ guided: false })
    })

    it("can't be slipped across weeks: episodes opened without the guide earlier still count when it's switched on", async () => {
      const a = await learner()
      const eps = [await episode(), await episode(), await episode()]
      for (const e of eps) expect(await startListen(sql, a, e, null)).toEqual({ guided: false })
      await sql`update listens set started_at = now() - interval '8 days' where user_id = ${a}`
      const guided = []
      for (const e of eps) guided.push((await startListen(sql, a, e, 'standard')).guided)
      expect(guided).toEqual([true, false, false])
      const [row] = await sql`select guided_at from listens where user_id = ${a} and episode_id = ${eps[0]!}`
      expect(row!.guided_at).not.toBeNull()
    })

    it("keeps the week the guide was first switched on, and last week's guided episode doesn't use up this week's", async () => {
      const a = await learner()
      const [old, fresh] = [await episode(), await episode()]
      expect(await startListen(sql, a, old, 'standard')).toEqual({ guided: true })
      await sql`update listens set started_at = now() - interval '8 days', guided_at = now() - interval '8 days' where user_id = ${a}`
      expect(await startListen(sql, a, old, 'standard')).toEqual({ guided: true }) // still guided on replay
      const [row] = await sql`select guided_at < now() - interval '7 days' as kept from listens where user_id = ${a} and episode_id = ${old}`
      expect(row!.kept).toBe(true)
      expect(await startListen(sql, a, fresh, 'standard')).toEqual({ guided: true })
    })
  })

  describe('spending ledger', () => {
    it('totals today, and settles a reservation to the real cost', async () => {
      const ledger = pgSpendLedger(sql)
      await ledger.reserve('j1', 0.5)
      await ledger.reserve('j2', 0.25)
      expect(await ledger.todayUSD()).toBeCloseTo(0.75, 4)
      await ledger.settle('j1', { transcriptionSec: 3600, textInTokens: 0, textOutTokens: 0, ttsAudioSec: 0 })
      expect(await ledger.todayUSD()).toBeCloseTo(0.47, 4)
    })
  })
})
