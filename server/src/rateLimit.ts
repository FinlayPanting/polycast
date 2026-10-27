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
 * The caller's address. Railway's edge overwrites X-Real-IP (and X-Forwarded-For) with the address it saw, so a
 * caller's own copy never reaches us (checked 26 Oct 2026, PC-1025-03); the last X-Forwarded-For entry is a fallback.
 */
export function clientAddress(header: (name: string) => string | undefined): string {
  const real = header('x-real-ip')?.trim()
  if (real) return real
  const forwarded = header('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean)
  return forwarded?.at(-1) ?? 'unknown'
}

/**
 * The key an address is counted under (PC-1025-03). One phone or home controls a whole IPv6 /64 block, so IPv6
 * callers are counted by that block; IPv4 (and IPv4 written as IPv6) by the address itself.
 */
export function addressKey(address: string): string {
  const a = address.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]!
  if (!a.includes(':')) return a
  const mapped = a.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? a.match(/^::(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return mapped[1]!
  const [head = '', tail] = a.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return a
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`
}
