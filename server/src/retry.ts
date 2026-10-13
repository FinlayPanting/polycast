import { ProviderError } from './providers/types'

export interface RetryOptions {
  attempts?: number
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** How long a rate-limited provider asked us to wait ("Please retry in 38s"), if it said. */
export function retryAfterMs(e: unknown): number | undefined {
  const m = e instanceof Error ? /retry in (\d+(?:\.\d+)?)\s*s/i.exec(e.message) : null
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined
}

/**
 * Retries retryable provider errors with exponential backoff: 1s, 2s, 4s by default. Rate limits
 * (429) get more patience: up to 8 tries, waiting as long as the provider asks (at most 90s).
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 4
  const base = opts.baseDelayMs ?? 1000
  const sleep = opts.sleep ?? realSleep
  let last: unknown
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      const rateLimited = e instanceof ProviderError && e.status === 429
      const retryable = e instanceof ProviderError ? e.retryable : e instanceof TypeError // network failures surface as TypeError
      if (!retryable || i >= (rateLimited ? Math.max(attempts, 8) : attempts) - 1) throw last
      const backoff = base * 2 ** i
      await sleep(rateLimited ? Math.min(90_000, Math.max(retryAfterMs(e) ?? 0, backoff, 5 * base) + base) : backoff)
    }
  }
}

/**
 * Wraps a function so it's called at most `perMinute` times in any rolling minute, across all
 * callers; extra calls wait their turn. Keeps us under a provider's requests-per-minute limit.
 */
export function perMinute<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  limit: number,
  clock: { now: () => number; sleep: (ms: number) => Promise<void> } = { now: Date.now, sleep: realSleep },
): (...args: A) => Promise<R> {
  const starts: number[] = []
  let queue: Promise<void> = Promise.resolve()
  const slot = async () => {
    for (;;) {
      const t = clock.now()
      while (starts.length && t - starts[0]! >= 60_000) starts.shift()
      if (starts.length < limit) {
        starts.push(t)
        return
      }
      await clock.sleep(60_000 - (t - starts[0]!) + 50)
    }
  }
  return (...args: A) => {
    const turn = queue.then(slot)
    queue = turn.catch(() => {})
    return turn.then(() => fn(...args))
  }
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
