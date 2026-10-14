import { describe, expect, it } from 'vitest'
import { FIRST_OPEN_KEY, reportFirstOpen } from './firstOpen'

function deps(ok = true) {
  const store = new Map<string, string>()
  let posts = 0
  return {
    store,
    posts: () => posts,
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    post: async () => (posts++, ok),
  }
}

describe('reportFirstOpen', () => {
  it('counts the first open once per install', async () => {
    const d = deps()
    expect(await reportFirstOpen(d)).toBe('sent')
    expect(await reportFirstOpen(d)).toBe('already')
    expect(d.posts()).toBe(1)
    expect(d.store.get(FIRST_OPEN_KEY)).toBe('1')
  })

  it('tries again next launch if the server could not be reached', async () => {
    const d = deps(false)
    expect(await reportFirstOpen(d)).toBe('failed')
    expect(d.store.has(FIRST_OPEN_KEY)).toBe(false)
    expect(await reportFirstOpen({ ...d, post: async () => { throw new Error('offline') } })).toBe('failed')
  })
})
