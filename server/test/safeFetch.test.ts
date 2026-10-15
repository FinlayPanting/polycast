import { describe, expect, it } from 'vitest'
import { checkPublicUrl, isPrivateAddress, safeFetch, TooLarge, UnsafeUrl } from '../src/safeFetch'

const publicHost = async () => ['93.184.216.34']

describe('isPrivateAddress', () => {
  it('flags private, loopback, link-local, metadata and internal IPv6 addresses', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '0.0.0.0', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '224.0.0.1', '::1', '::', 'fd12:3456::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:a00:1', '64:ff9b::a00:1', 'not-an-ip']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })
  it('lets public addresses through', () => {
    for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })
})

describe('checkPublicUrl', () => {
  it('refuses other schemes, logins, localhost and hosts that resolve to a private address', async () => {
    await expect(checkPublicUrl('file:///etc/passwd', publicHost)).rejects.toBeInstanceOf(UnsafeUrl)
    await expect(checkPublicUrl('ftp://feeds.example.com/x', publicHost)).rejects.toBeInstanceOf(UnsafeUrl)
    await expect(checkPublicUrl('https://user:pw@feeds.example.com/x', publicHost)).rejects.toBeInstanceOf(UnsafeUrl)
    await expect(checkPublicUrl('http://localhost:8787/admin', publicHost)).rejects.toBeInstanceOf(UnsafeUrl)
    await expect(checkPublicUrl('http://postgres.railway.internal/', publicHost)).rejects.toBeInstanceOf(UnsafeUrl)
    await expect(checkPublicUrl('http://[::1]/', publicHost)).rejects.toBeInstanceOf(UnsafeUrl)
    await expect(checkPublicUrl('https://sneaky.example/', async () => ['93.184.216.34', '10.0.0.1'])).rejects.toBeInstanceOf(UnsafeUrl)
    await expect(checkPublicUrl('https://gone.example/', async () => { throw new Error('ENOTFOUND') })).rejects.toBeInstanceOf(UnsafeUrl)
    expect((await checkPublicUrl('https://feeds.example.com/a.xml', publicHost)).href).toBe('https://feeds.example.com/a.xml')
  })
})

describe('safeFetch', () => {
  it('returns the body of a public feed', async () => {
    const r = await safeFetch('https://feeds.example.com/a.xml', { fetch: async () => new Response('<rss/>'), lookupHost: publicHost })
    expect(r.ok).toBe(true)
    expect(new TextDecoder().decode(r.body)).toBe('<rss/>')
  })

  it('checks every redirect, so a public feed cannot bounce to an internal address', async () => {
    const seen: string[] = []
    const f: typeof fetch = async (input) => {
      seen.push(String(input))
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })
    }
    await expect(safeFetch('https://feeds.example.com/a.xml', { fetch: f, lookupHost: publicHost })).rejects.toBeInstanceOf(UnsafeUrl)
    expect(seen).toEqual(['https://feeds.example.com/a.xml'])
  })

  it('follows a few public redirects, then gives up', async () => {
    let n = 0
    const f: typeof fetch = async () => (n++ < 2 ? new Response(null, { status: 301, headers: { location: `/moved-${n}` } }) : new Response('ok'))
    const r = await safeFetch('https://feeds.example.com/a.xml', { fetch: f, lookupHost: publicHost })
    expect(r.url).toBe('https://feeds.example.com/moved-2')
    const loop: typeof fetch = async () => new Response(null, { status: 302, headers: { location: '/again' } })
    await expect(safeFetch('https://feeds.example.com/a.xml', { fetch: loop, lookupHost: publicHost, maxRedirects: 3 })).rejects.toThrow(/Too many redirects/)
  })

  it('stops reading a feed that is too large, whether or not it says so up front', async () => {
    const declared: typeof fetch = async () => new Response('x', { headers: { 'content-length': '999999999' } })
    await expect(safeFetch('https://feeds.example.com/a.xml', { fetch: declared, lookupHost: publicHost, maxBytes: 1000 })).rejects.toBeInstanceOf(TooLarge)
    const endless: typeof fetch = async () =>
      new Response(new ReadableStream({ pull: (c) => c.enqueue(new Uint8Array(512)) }))
    await expect(safeFetch('https://feeds.example.com/a.xml', { fetch: endless, lookupHost: publicHost, maxBytes: 10_000 })).rejects.toBeInstanceOf(TooLarge)
  })

  it('gives up on a feed that never answers', async () => {
    const hang: typeof fetch = (_input, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))
    const started = Date.now()
    await expect(safeFetch('https://feeds.example.com/a.xml', { fetch: hang, lookupHost: publicHost, timeoutMs: 50 })).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
