import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Fetching addresses a learner's phone sent us (show feeds) or that a feed names (transcripts),
 * safely (board item PC-1013-04): only http(s) to public internet addresses, a time limit, a size
 * limit, and every redirect checked the same way. Stops one bad or hostile feed from hanging the
 * server or reaching Railway's internal network (server-side request forgery).
 *
 * Known gap: the name is resolved here and again by fetch, so a host that changes its DNS answer
 * between the two (DNS rebinding) isn't caught. The time and size limits still hold.
 */

export type LookupHost = (hostname: string) => Promise<string[]>

export const dnsLookupHost: LookupHost = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address)

export class UnsafeUrl extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrl'
  }
}

export class TooLarge extends Error {
  constructor(readonly maxBytes: number) {
    super(`Reply larger than ${Math.round(maxBytes / 1e6)} MB`)
    this.name = 'TooLarge'
  }
}

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number]
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT, also used by some clouds internally
    (a === 169 && b === 254) || // link-local, including cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // 192.0.0.0/24 protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  )
}

/** True for any address that isn't on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) return ipv4Private(ip)
  if (v !== 6) return true
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '')
  // IPv4 written inside IPv6 (::ffff:10.0.0.1, ::10.0.0.1, or the hex form ::ffff:a00:1).
  const dotted = /^::(?:ffff:(?:0:)?)?(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (dotted) return ipv4Private(dotted[1]!)
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s)
  if (hex) {
    const n = (parseInt(hex[1]!, 16) << 16) | parseInt(hex[2]!, 16)
    return ipv4Private([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'))
  }
  if (s === '::' || s === '::1') return true
  const first = parseInt(s.split(':')[0] || '0', 16)
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7 (Railway's private network is fd12::/16)
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 || // multicast
    s.startsWith('64:ff9b:') || // NAT64, can reach IPv4 private ranges
    s.startsWith('2001:db8:') // documentation
  )
}

/** Refuses anything but http(s) to a host that resolves only to public addresses. */
export async function checkPublicUrl(raw: string, lookupHost: LookupHost = dnsLookupHost): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrl('Not a web address')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new UnsafeUrl(`Only web addresses are fetched, not ${url.protocol}`)
  if (url.username || url.password) throw new UnsafeUrl('Addresses with a login are not fetched')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (/^localhost$|\.localhost$|\.internal$|\.local$/i.test(host)) throw new UnsafeUrl('Private address')
  let addresses: string[]
  if (isIP(host)) addresses = [host]
  else {
    try {
      addresses = await lookupHost(host)
    } catch {
      throw new UnsafeUrl(`Couldn't find ${host}`)
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new UnsafeUrl('Private address')
  return url
}

/** Reads a reply's body, giving up once it passes `maxBytes`. */
export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {})
    throw new TooLarge(maxBytes)
  }
  if (!res.body) return new Uint8Array(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new TooLarge(maxBytes)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) (out.set(c, o), (o += c.byteLength))
  return out
}

export interface SafeFetchOptions {
  fetch?: typeof fetch
  lookupHost?: LookupHost
  /** For the whole fetch, redirects and body included. */
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  headers?: Record<string, string>
}

/** Big feeds with years of episodes run to a few MB; nothing real comes near this. */
export const FEED_MAX_BYTES = 20 * 1024 * 1024
export const FEED_TIMEOUT_MS = 15_000

/**
 * Opens a public address, following at most a few redirects, each checked before it is fetched,
 * and hands back the reply unread, for callers that only want the start of it (PC-1022-01). The
 * time limit covers reading the body too.
 */
export async function safeOpen(raw: string, opts: SafeFetchOptions = {}): Promise<{ res: Response; url: string }> {
  const f = opts.fetch ?? fetch
  const signal = AbortSignal.timeout(opts.timeoutMs ?? FEED_TIMEOUT_MS)
  let current = raw
  for (let hop = 0; ; hop++) {
    const url = await checkPublicUrl(current, opts.lookupHost)
    const res = await f(url.href, { headers: opts.headers, redirect: 'manual', signal })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {})
      if (hop >= (opts.maxRedirects ?? 5)) throw new UnsafeUrl('Too many redirects')
      current = new URL(location, url).href
      continue
    }
    return { res, url: url.href }
  }
}

/** Fetches a public address under a time and size limit, following at most a few checked redirects. */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<{ status: number; ok: boolean; body: Uint8Array; url: string }> {
  const { res, url } = await safeOpen(raw, opts)
  const body = res.ok ? await readCapped(res, opts.maxBytes ?? FEED_MAX_BYTES) : (await res.body?.cancel().catch(() => {}), new Uint8Array(0))
  return { status: res.status, ok: res.ok, body, url }
}

export const POLYCAST_UA = { 'User-Agent': 'Polycast/1.0 (+https://polycast.app)' }
