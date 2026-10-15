/**
 * A small in-memory rate limiter: at most `limit` hits per key in each fixed window.
 * The server runs as one process on Railway, so memory is enough; a restart simply forgets.
 */
export interface RateLimiter {
  /** Records a hit for `key`; false if the key is over its limit for this window. */
  hit(key: string): boolean
}

export function rateLimiter(limit: number, windowMs: number, now: () => number = Date.now, maxKeys = 10_000): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>()
  return {
    hit(key) {
      const t = now()
      let w = windows.get(key)
      if (!w || t - w.start >= windowMs) {
        // Keep memory bounded: drop finished windows, and if that isn't enough, the oldest entries.
        if (!w && windows.size >= maxKeys) {
          for (const [k, v] of windows) if (t - v.start >= windowMs) windows.delete(k)
          for (const k of windows.keys()) {
            if (windows.size < maxKeys) break
            windows.delete(k)
          }
        }
        w = { start: t, count: 0 }
        windows.delete(key)
        windows.set(key, w)
      }
      w.count++
      return w.count <= limit
    },
  }
}

/**
 * The caller's address. Railway's edge sets X-Real-IP and appends the caller to X-Forwarded-For,
 * so we trust X-Real-IP, then the last X-Forwarded-For entry (earlier ones can be made up by the caller).
 */
export function clientAddress(header: (name: string) => string | undefined): string {
  const real = header('x-real-ip')?.trim()
  if (real) return real
  const forwarded = header('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean)
  return forwarded?.at(-1) ?? 'unknown'
}
