import { describe, expect, it } from 'vitest'
import { fetchWithTimeout, fromStoredPath, isOfflineError, TimeoutError, toStoredPath } from './net'

describe('requests with a time limit', () => {
  it('gives up on a hanging request', async () => {
    const hang: typeof fetch = (_u, init) => new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    await expect(fetchWithTimeout(hang, 'https://x', {}, 20)).rejects.toBeInstanceOf(TimeoutError)
  })
  it('passes a quick answer through, and other failures as they are', async () => {
    const ok: typeof fetch = async () => new Response('hi')
    expect(await (await fetchWithTimeout(ok, 'https://x', {}, 1000)).text()).toBe('hi')
    const down: typeof fetch = async () => {
      throw new TypeError('Network request failed')
    }
    await expect(fetchWithTimeout(down, 'https://x', {}, 1000)).rejects.toThrow('Network request failed')
  })
})

describe('when to play the copy saved on the phone', () => {
  it('plays it with no signal, after a time-out, or with the server away', () => {
    expect(isOfflineError(new TypeError('Network request failed'))).toBe(true)
    expect(isOfflineError(new TimeoutError())).toBe(true)
    expect(isOfflineError({ status: 502 })).toBe(true)
  })
  it('shows the server’s answer instead when it gave one', () => {
    expect(isOfflineError({ status: 404, message: 'This show isn’t available on Polycast.' })).toBe(false)
    expect(isOfflineError({ status: 402 })).toBe(false)
    expect(isOfflineError({ status: 401 })).toBe(false)
  })
})

describe('saved files survive an app update', () => {
  const before = 'file:///var/mobile/Containers/Data/Application/AAAA/Documents/episodes'
  const after = 'file:///var/mobile/Containers/Data/Application/BBBB/Documents/episodes/'

  it('remembers files relative to the downloads folder and finds them in the new one', () => {
    const stored = toStoredPath(`${before}/ep.mp3`, before)
    expect(stored).toBe('polycast-episodes:ep.mp3')
    expect(fromStoredPath(stored, after)).toBe('file:///var/mobile/Containers/Data/Application/BBBB/Documents/episodes/ep.mp3')
    expect(fromStoredPath(toStoredPath(`${before}/ep-guide/abc-line.m4a`, before + '/'), after)).toBe(`${after}ep-guide/abc-line.m4a`)
  })
  it('rescues full paths saved by older builds', () => {
    expect(fromStoredPath(`${before}/ep.mp3`, after)).toBe(`${after}ep.mp3`)
  })
  it('leaves web addresses alone', () => {
    expect(toStoredPath('https://cdn.test/ep.mp3', before)).toBe('https://cdn.test/ep.mp3')
    expect(fromStoredPath('https://cdn.test/Documents/episodes/x.mp3', after)).toBe('https://cdn.test/Documents/episodes/x.mp3')
  })
})
