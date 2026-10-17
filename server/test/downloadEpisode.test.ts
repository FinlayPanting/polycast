import { describe, expect, it } from 'vitest'
import { downloadEpisode } from '../src/audio'

const publicHost = async () => ['93.184.216.34']

/** A reply whose body arrives in chunks and declares no length, like a chunked transfer. */
function chunked(chunks: number, size: number) {
  let sent = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent++ >= chunks) return c.close()
        c.enqueue(new Uint8Array(size))
      },
    }),
  )
}

describe('downloading an episode', () => {
  it('returns the audio from a public address, following checked redirects', async () => {
    const seen: string[] = []
    const fetchImpl = (async (url: string) => {
      seen.push(url)
      if (url.includes('tracker')) return new Response(null, { status: 302, headers: { location: 'https://cdn.example.com/ep.mp3' } })
      return new Response(new Uint8Array([1, 2, 3]))
    }) as typeof fetch
    const bytes = await downloadEpisode(fetchImpl, 1000, { lookupHost: publicHost })('https://tracker.example.com/r/ep.mp3')
    expect([...bytes]).toEqual([1, 2, 3])
    expect(seen).toEqual(['https://tracker.example.com/r/ep.mp3', 'https://cdn.example.com/ep.mp3'])
  })

  it("won't follow a redirect into Railway's private network", async () => {
    const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/secret' } })) as typeof fetch
    await expect(downloadEpisode(fetchImpl, 1000, { lookupHost: publicHost })('https://feeds.example.com/ep.mp3')).rejects.toThrow(/Couldn't download/)
  })

  it('refuses an episode address on a private host outright', async () => {
    let called = false
    const fetchImpl = (async () => ((called = true), new Response('x'))) as typeof fetch
    await expect(downloadEpisode(fetchImpl, 1000, { lookupHost: async () => ['127.0.0.1'] })('https://evil.example.com/ep.mp3')).rejects.toThrow()
    expect(called).toBe(false)
  })

  it('stops reading once an undeclared length passes the cap', async () => {
    const fetchImpl = (async () => chunked(1000, 1024)) as typeof fetch
    await expect(downloadEpisode(fetchImpl, 10 * 1024, { lookupHost: publicHost })('https://cdn.example.com/ep.mp3')).rejects.toThrow(/too large/)
  })

  it('refuses a declared length over the cap before reading', async () => {
    const fetchImpl = (async () => new Response('tiny', { headers: { 'content-length': '999999999' } })) as typeof fetch
    await expect(downloadEpisode(fetchImpl, 1000, { lookupHost: publicHost })('https://cdn.example.com/ep.mp3')).rejects.toThrow(/too large/)
  })

  it('reports a failed download with its status', async () => {
    const fetchImpl = (async () => new Response('gone', { status: 404 })) as typeof fetch
    await expect(downloadEpisode(fetchImpl, 1000, { lookupHost: publicHost })('https://cdn.example.com/ep.mp3')).rejects.toThrow("Couldn't download the episode: 404")
  })

  it('gives up after the time limit', async () => {
    const fetchImpl = ((_u: string, init?: RequestInit) =>
      new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch
    await expect(downloadEpisode(fetchImpl, 1000, { lookupHost: publicHost, timeoutMs: 50 })('https://cdn.example.com/ep.mp3')).rejects.toThrow()
  })
})
