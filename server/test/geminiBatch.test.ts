import { costUSD, ZERO_USAGE } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { batchFirst, BatchUnavailable, geminiBatchText, readBatch } from '../src/providers/geminiBatch'
import type { TextModel } from '../src/providers/types'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const result = (text: string) => ({ response: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300 } } })
const input = { system: 'You write lesson plans.', prompt: 'Episode', schema: { type: 'object' } }

function scripted(replies: Response[]) {
  const calls: { url: string; method: string; body?: any }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return replies.shift() ?? json({}, 500)
  }) as typeof fetch
  return { calls, fetchImpl }
}

describe('Gemini batch service', () => {
  it('sends one inline request, waits for the batch, and reports batch tokens', async () => {
    const { calls, fetchImpl } = scripted([
      json({ name: 'batches/42', metadata: { state: 'JOB_STATE_PENDING' } }),
      json({ name: 'batches/42', metadata: { state: 'JOB_STATE_RUNNING' } }),
      json({ name: 'batches/42', metadata: { state: 'JOB_STATE_SUCCEEDED' }, done: true, response: { inlinedResponses: { inlinedResponses: [result('{"ok":1}')] } } }),
    ])
    const model = geminiBatchText('k', 'gemini-3.8-flash', fetchImpl, { sleep: async () => {} })
    const r = await model.generateJson<{ ok: number }>(input)
    expect(r.data).toEqual({ ok: 1 })
    expect(r.usage).toEqual({ batchTextInTokens: 1200, batchTextOutTokens: 300 })
    expect(calls[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:batchGenerateContent')
    expect(calls[0]!.body.batch.input_config.requests.requests[0].request.generationConfig.responseMimeType).toBe('application/json')
    expect(calls[2]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/batches/42')
  })

  it('reads the state and results wherever the docs put them', () => {
    expect(readBatch({ state: 'JOB_STATE_SUCCEEDED', dest: { inlinedResponses: [result('{}')] } }).response).toBeDefined()
    expect(readBatch({ metadata: { state: 'BATCH_STATE_RUNNING' } }).state).toBe('BATCH_STATE_RUNNING')
  })

  it('stops on a failed batch', async () => {
    const { fetchImpl } = scripted([json({ name: 'batches/1', metadata: { state: 'JOB_STATE_FAILED' } })])
    await expect(geminiBatchText('k', undefined, fetchImpl, { sleep: async () => {} }).generateJson(input)).rejects.toBeInstanceOf(BatchUnavailable)
  })

  it('cancels a batch that takes too long, so it is not charged as well', async () => {
    let t = 0
    const { calls, fetchImpl } = scripted([json({ name: 'batches/7', metadata: { state: 'JOB_STATE_PENDING' } }), json({ name: 'batches/7', metadata: { state: 'JOB_STATE_PENDING' } }), json({})])
    const model = geminiBatchText('k', undefined, fetchImpl, { pollMs: 1000, maxWaitMs: 1500, sleep: async (ms) => void (t += ms), now: () => t })
    await expect(model.generateJson(input)).rejects.toBeInstanceOf(BatchUnavailable)
    expect(calls.at(-1)).toMatchObject({ url: 'https://generativelanguage.googleapis.com/v1beta/batches/7:cancel', method: 'POST' })
  })

  it('costs half the standard rate', () => {
    const standard = costUSD({ ...ZERO_USAGE, textInTokens: 1e6, textOutTokens: 1e6 }, new Date('2026-11-01'))
    const batch = costUSD({ ...ZERO_USAGE, batchTextInTokens: 1e6, batchTextOutTokens: 1e6 }, new Date('2026-11-01'))
    expect(batch).toBeCloseTo(standard / 2, 6)
    expect(costUSD({ ...ZERO_USAGE, batchTextInTokens: 1e6, batchTextOutTokens: 1e6 }, new Date('2027-02-01'))).toBeCloseTo(4.5, 6)
  })
})

describe('batch first, standard rate as a fallback', () => {
  const standard: TextModel & { calls: number } = {
    calls: 0,
    async generateJson<T>() {
      this.calls++
      return { data: { via: 'standard' } as T, usage: { textInTokens: 1 } }
    },
  }
  const ok: TextModel = { generateJson: async <T,>() => ({ data: { via: 'batch' } as T, usage: { batchTextInTokens: 1 } }) }
  const broken: TextModel = { generateJson: async () => { throw new BatchUnavailable('not done') } }

  it('uses the batch while it works', async () => {
    const m = batchFirst(() => ok, standard, Date.now() + 60_000)
    expect((await m.generateJson<{ via: string }>(input)).data.via).toBe('batch')
  })

  it('falls back after a failure, and stays on the standard rate for the rest of the job', async () => {
    let tries = 0
    const m = batchFirst(() => (tries++, broken), standard, Date.now() + 60_000)
    expect((await m.generateJson<{ via: string }>(input)).data.via).toBe('standard')
    expect((await m.generateJson<{ via: string }>(input)).data.via).toBe('standard')
    expect(tries).toBe(1)
  })

  it('skips the batch once the job has used up its waiting time', async () => {
    let tries = 0
    const m = batchFirst(() => (tries++, ok), standard, 1000, { now: () => 2000 })
    expect((await m.generateJson<{ via: string }>(input)).data.via).toBe('standard')
    expect(tries).toBe(0)
  })

  it('gives each batch call no more than the waiting time left', async () => {
    const waits: number[] = []
    const m = batchFirst((ms) => (waits.push(ms), ok), standard, 5000, { now: () => 1000 })
    await m.generateJson(input)
    expect(waits).toEqual([4000])
  })
})
