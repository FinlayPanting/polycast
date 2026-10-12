import { ProviderError } from './providers/types'

export interface RetryOptions {
  attempts?: number
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Retries retryable provider errors with exponential backoff: 1s, 2s, 4s by default. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 4
  const base = opts.baseDelayMs ?? 1000
  const sleep = opts.sleep ?? realSleep
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      const retryable = e instanceof ProviderError ? e.retryable : e instanceof TypeError // network failures surface as TypeError
      if (!retryable || i === attempts - 1) throw e
      await sleep(base * 2 ** i)
    }
  }
  throw last
}

/** Runs tasks with at most `limit` in flight, keeping result order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}
