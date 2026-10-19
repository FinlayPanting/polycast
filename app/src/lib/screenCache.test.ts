import { describe, expect, it } from 'vitest'
import { ScreenCache } from './screenCache'

function memoryStore() {
  const m = new Map<string, string>()
  return { m, getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v) }
}

describe('screens show their last answer straight away', () => {
  it('keeps what a screen last loaded', async () => {
    const c = new ScreenCache()
    expect(await c.get('show:p1')).toBeUndefined()
    c.set('show:p1', { title: 'Svenska Samtal' })
    expect(c.peek('show:p1')).toEqual({ title: 'Svenska Samtal' })
  })

  it("keeps Discover's shelves on the phone between launches, but not show pages", async () => {
    const store = memoryStore()
    new ScreenCache(store).set('discover:sv', { shelves: [1] })
    new ScreenCache(store).set('show:p1', { title: 'x' })
    await Promise.resolve()
    const next = new ScreenCache(store)
    expect(await next.get('discover:sv')).toEqual({ shelves: [1] })
    expect(await next.get('show:p1')).toBeUndefined()
  })

  it('forgets the oldest once full', () => {
    const c = new ScreenCache(undefined, 2)
    c.set('a', 1)
    c.set('b', 2)
    c.set('c', 3)
    expect(c.peek('a')).toBeUndefined()
    expect(c.peek('c')).toBe(3)
  })

  it('shrugs off a broken copy on the phone', async () => {
    const store = memoryStore()
    store.m.set('polycast.screen.v1.discover:sv', '{oops')
    expect(await new ScreenCache(store).get('discover:sv')).toBeUndefined()
  })
})
