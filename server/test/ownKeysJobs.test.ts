import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claimNextJob, requestOwnKeysPreparation, type Sql } from '../src/db'
import { loadJobKeys, storeJobKeys } from '../src/ownKeys'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip
const SECRET = Buffer.alloc(32, 7).toString('base64')
const KEYS = { elevenlabs: 'sk_eleven_abcdefghijklmnopqrstuvwx', gemini: 'AIzaSy-abcdefghijklmnopqrstuvwxyz0123' }

run('own-key jobs and their keys', () => {
  let sql: Sql
  let drop: () => Promise<void>
  beforeAll(async () => void ({ sql, drop } = await freshDatabase()))
  afterAll(async () => drop?.())

  async function learner(): Promise<string> {
    const id = randomUUID()
    await sql`insert into auth.users (id) values (${id})`
    return id
  }
  async function episode(): Promise<string> {
    const [p] = await sql`insert into podcasts (feed_url, title, language) values (${`https://f/${randomUUID()}`}, 'Svenska Samtal', 'sv') returning id`
    const [e] = await sql`insert into episodes (podcast_id, guid, title, duration_sec, audio_url, language)
                          values (${p!.id}, ${randomUUID()}, 'Tåget', 1200, 'https://cdn/a.mp3', 'sv') returning id`
    return e!.id as string
  }

  it('saves the keys in the same step as queuing, so a worker claiming straight away finds them (PC-1019-01)', async () => {
    const anna = await learner()
    const ep = await episode()
    let claimedMeanwhile: unknown = 'not tried'
    const r = await requestOwnKeysPreparation(sql, anna, ep, 'mia', 10, async (tx, jobId) => {
      // A worker on another connection tries to claim while the request is still in flight.
      claimedMeanwhile = await claimNextJob(sql, 'learners')
      await storeJobKeys(tx, jobId, anna, KEYS, SECRET)
    })
    expect(r).toMatchObject({ status: 'queued', charge: 'ownKeys' })
    expect(claimedMeanwhile).toBeUndefined() // the job isn't visible until its keys are
    const job = (await claimNextJob(sql, 'learners'))!
    expect(job.id).toBe((r as { jobId: string }).jobId)
    expect(await loadJobKeys(sql, job.id, SECRET)).toEqual(KEYS)
  })

  it('queues nothing when the keys can’t be saved', async () => {
    const ben = await learner()
    const ep = await episode()
    await expect(
      requestOwnKeysPreparation(sql, ben, ep, 'mia', 10, async () => {
        throw new Error('database hiccup')
      }),
    ).rejects.toThrow('database hiccup')
    expect((await sql`select count(*)::int as n from prep_jobs where episode_id = ${ep}`)[0]!.n).toBe(0)
    expect((await sql`select status from episodes where id = ${ep}`)[0]!.status).not.toBe('preparing')
  })

  it('doesn’t store keys for an episode already preparing on someone else’s request', async () => {
    const cleo = await learner()
    const dan = await learner()
    const ep = await episode()
    await requestOwnKeysPreparation(sql, cleo, ep, 'mia', 10, (tx, jobId) => storeJobKeys(tx, jobId, cleo, KEYS, SECRET))
    let stored = false
    const again = await requestOwnKeysPreparation(sql, dan, ep, 'mia', 10, async () => void (stored = true))
    expect(again).toMatchObject({ status: 'queued', charge: 'none' })
    expect(stored).toBe(false)
  })
})
