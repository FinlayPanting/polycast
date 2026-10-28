import { ProviderError, errorFromResponse, type JsonSchema, type TextModel } from './types'
import { GEMINI_MODELS, GEMINI_STORE } from './gemini'

const ROOT = 'https://generativelanguage.googleapis.com/v1beta'

export interface BatchOptions {
  /** How often to ask whether the batch is done. */
  pollMs?: number
  /** Give up (and cancel the batch) after this long; the caller then uses the standard rate. */
  maxWaitMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

/** The batch didn't finish in time or came back in a shape we don't understand. Not the learner's problem. */
export class BatchUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BatchUnavailable'
  }
}

const DONE_OK = new Set(['JOB_STATE_SUCCEEDED', 'BATCH_STATE_SUCCEEDED'])
const DONE_BAD = new Set(['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED', 'BATCH_STATE_FAILED', 'BATCH_STATE_CANCELLED', 'BATCH_STATE_EXPIRED'])

/** Google's docs show the state and the results in more than one place, so look in each. */
export function readBatch(json: any): { state?: string; response?: any } {
  const state: string | undefined = json?.metadata?.state ?? json?.state ?? (json?.done ? 'JOB_STATE_SUCCEEDED' : undefined)
  const holders = [json?.response, json?.dest, json?.metadata?.output, json?.output]
  for (const h of holders) {
    const list = h?.inlinedResponses?.inlinedResponses ?? h?.inlinedResponses
    if (Array.isArray(list) && list.length > 0) return { state, response: list[0] }
  }
  return { state }
}

/**
 * Gemini's batch service at half the standard price. Each call is sent as a one-request batch and
 * waited on, so it suits only work nobody is waiting for: re-plans after a guide update, paid by
 * Polycast. Usage is reported as batch tokens so the spending cap counts the lower price.
 */
export function geminiBatchText(apiKey: string, model: string = GEMINI_MODELS.text, fetchImpl: typeof fetch = fetch, opts: BatchOptions = {}): TextModel {
  const pollMs = opts.pollMs ?? 30_000
  const maxWaitMs = opts.maxWaitMs ?? 10 * 60_000
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const now = opts.now ?? Date.now
  const headers = { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' }
  return {
    async generateJson<T>({ system, prompt, schema, temperature }: { system: string; prompt: string; schema: JsonSchema; temperature?: number }) {
      const input = `${system}\n\n${prompt}`
      const request = {
        store: GEMINI_STORE,
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, ...(temperature !== undefined ? { temperature } : {}) },
      }
      const created = await fetchImpl(`${ROOT}/models/${model}:batchGenerateContent`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ batch: { display_name: 'polycast-replan', input_config: { requests: { requests: [{ request, metadata: { key: 'r' } }] } } } }),
      })
      if (!created.ok) throw errorFromResponse('Gemini batch', created.status, await created.text())
      const job = await created.json()
      const name: string | undefined = job?.name
      if (!name) throw new BatchUnavailable('Gemini batch reply had no name')
      const started = now()
      let status = job
      for (;;) {
        const { state, response } = readBatch(status)
        if (state && DONE_OK.has(state)) {
          if (!response) throw new BatchUnavailable('Gemini batch finished without a result')
          return parse<T>(response, input.length)
        }
        if (state && DONE_BAD.has(state)) throw new BatchUnavailable(`Gemini batch ended: ${state}`)
        if (now() - started >= maxWaitMs) {
          // Cancel, so a batch we've stopped waiting for isn't finished and charged as well.
          await fetchImpl(`${ROOT}/${name}:cancel`, { method: 'POST', headers }).catch(() => {})
          throw new BatchUnavailable(`Gemini batch not done after ${Math.round(maxWaitMs / 60_000)} minutes`)
        }
        await sleep(pollMs)
        const res = await fetchImpl(`${ROOT}/${name}`, { headers })
        if (!res.ok) throw errorFromResponse('Gemini batch', res.status, await res.text())
        status = await res.json()
      }
    },
  }
}

function parse<T>(item: any, promptChars: number) {
  if (item?.error) throw new BatchUnavailable(`Gemini batch request failed: ${JSON.stringify(item.error).slice(0, 200)}`)
  const r = item?.response ?? item
  const text = (r?.candidates?.[0]?.content?.parts ?? []).map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('')
  if (!text) throw new BatchUnavailable('Gemini batch result had no text')
  let data: T
  try {
    data = JSON.parse(text) as T
  } catch {
    throw new ProviderError('Gemini batch reply was not valid JSON', true)
  }
  const u = r?.usageMetadata ?? r?.usage_metadata ?? {}
  return {
    data,
    usage: {
      batchTextInTokens: typeof u.promptTokenCount === 'number' ? u.promptTokenCount : Math.ceil(promptChars / 4),
      batchTextOutTokens: typeof u.candidatesTokenCount === 'number' ? u.candidatesTokenCount : Math.ceil(text.length / 4),
    },
  }
}

/**
 * Batch first, the standard rate if it fails. `deadline` bounds the whole job's waiting on batches,
 * so a re-plan never runs into the worker's one-hour stale-job limit. Once it passes, or after the
 * first batch failure, every remaining call goes straight to the standard rate.
 */
export function batchFirst(batch: (maxWaitMs: number) => TextModel, standard: TextModel, deadline: number, opts: { now?: () => number; log?: (m: string) => void } = {}): TextModel {
  const now = opts.now ?? Date.now
  let gaveUp = false
  return {
    async generateJson<T>(input: Parameters<TextModel['generateJson']>[0]) {
      const left = deadline - now()
      if (!gaveUp && left > 0) {
        try {
          return await batch(left).generateJson<T>(input)
        } catch (e) {
          gaveUp = true
          opts.log?.(`batch unavailable, using the standard rate: ${e instanceof Error ? e.message : e}`)
        }
      }
      return standard.generateJson<T>(input)
    },
  }
}
