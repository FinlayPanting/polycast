import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FEEDBACK_LIMITS } from '@polycast/core'
import { createApi } from '../src/api'
import type { Sql } from '../src/db'
import { forgetOldFeedback, type FeedbackStorage } from '../src/feedback'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]).toString('base64')

function memoryBucket() {
  const files = new Map<string, { bytes: Uint8Array; type: string }>()
  const storage: FeedbackStorage = {
    async put(path, bytes, type) {
      files.set(path, { bytes, type })
    },
    async remove(paths) {
      for (const p of paths) files.delete(p)
    },
  }
  return { files, storage }
}

run("'Tell Finlay' (PC-1025-05)", () => {
  let sql: Sql
  let drop: () => Promise<void>
  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
  })
  afterAll(async () => drop?.())

  const learner = async () => {
    const id = randomUUID()
    await sql`insert into auth.users (id) values (${id})`
    return id
  }
  const setup = () => {
    const bucket = memoryBucket()
    const alerts: string[] = []
    const api = createApi({ sql, verify: async (t) => t, fetch, feedbackStorage: bucket.storage, alert: async (k, m) => void alerts.push(`${k}: ${m}`) })
    const send = (user: string | undefined, body: unknown) =>
      api.request('/v1/feedback', { method: 'POST', headers: { ...(user ? { Authorization: `Bearer ${user}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { ...bucket, alerts, api, send }
  }

  it('keeps the note with its screen, version and language, puts the screenshot in the private bucket and pings Finlay', async () => {
    const { files, alerts, send } = setup()
    const anna = await learner()
    const res = await send(anna, { message: 'The Words tab felt empty at first', screen: 'Words', appVersion: '1.0.0', language: 'sv', screenshot: jpeg })
    expect(res.status).toBe(200)
    const { id } = await res.json()
    const [row] = await sql`select * from feedback where id = ${id}`
    expect(row).toMatchObject({ user_id: anna, message: 'The Words tab felt empty at first', screen: 'Words', app_version: '1.0.0', language: 'sv', screenshot_path: `${id}.jpg` })
    expect(files.get(`${id}.jpg`)?.type).toBe('image/jpeg')
    expect(alerts).toEqual(['feedback: (Words, sv, v1.0.0, with a screenshot) The Words tab felt empty at first'])
  })

  it('takes a note without a screenshot, and refuses an empty one or a stranger', async () => {
    const { files, send } = setup()
    const ben = await learner()
    const { id } = await (await send(ben, { message: 'Love Mia' })).json()
    expect((await sql`select screenshot_path from feedback where id = ${id}`)[0]!.screenshot_path).toBeNull()
    expect(files.size).toBe(0)
    expect((await send(ben, { message: '' })).status).toBe(400)
    expect((await send(ben, { message: 'hi', screenshot: 'bm90IGFuIGltYWdl' })).status).toBe(400)
    expect((await send(undefined, { message: 'hi' })).status).toBe(401)
  })

  it('lets each learner send a few an hour', async () => {
    const { send } = setup()
    const cara = await learner()
    for (let i = 0; i < FEEDBACK_LIMITS.perHour; i++) expect((await send(cara, { message: `note ${i}` })).status).toBe(200)
    expect((await send(cara, { message: 'one more' })).status).toBe(429)
    expect((await send(await learner(), { message: 'someone else' })).status).toBe(200)
  })

  it('forgets notes and their screenshots after 90 days', async () => {
    const { files, storage, send } = setup()
    const dev = await learner()
    const { id: oldId } = await (await send(dev, { message: 'old', screenshot: jpeg })).json()
    const { id: newId } = await (await send(dev, { message: 'new', screenshot: jpeg })).json()
    await sql`update feedback set created_at = now() - interval '91 days' where id = ${oldId}`
    expect(await forgetOldFeedback(sql, storage)).toBeGreaterThanOrEqual(1)
    expect((await sql`select id from feedback where id = any(${[oldId, newId]}::uuid[])`).map((r) => r.id)).toEqual([newId])
    expect([...files.keys()]).toEqual([`${newId}.jpg`])
  })

  it('deletes a learner’s notes and screenshots with their account', async () => {
    const { files, api, send } = setup()
    const eve = await learner()
    const { id } = await (await send(eve, { message: 'bye', screenshot: jpeg })).json()
    expect(files.has(`${id}.jpg`)).toBe(true)
    const res = await api.request('/v1/account', { method: 'DELETE', headers: { Authorization: `Bearer ${eve}` } })
    expect(res.status).toBe(200)
    expect(files.has(`${id}.jpg`)).toBe(false)
    expect(await sql`select id from feedback where user_id = ${eve}`).toHaveLength(0)
  })
})
