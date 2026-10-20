import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }))
vi.mock('./api', () => ({ api: { changelog: async () => ({ entries: [] }) } }))

const { loadChangelog, markSeen, unread } = await import('./whatsNew')

function memory() {
  const m = new Map<string, string>()
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v) }
}
const log = { entries: [{ id: 'PC-1', date: '2026-10-20', kind: 'Feature', title: 'Listen later', description: 'Keep episodes for later.', tryIt: 'Tap Listen later' }] }

describe("What's new on the phone (PC-1019-F02)", () => {
  it('keeps the last copy, and shows it when the server can’t be reached', async () => {
    const store = memory()
    expect((await loadChangelog(async () => log, store)).entries).toHaveLength(1)
    await new Promise((r) => setTimeout(r, 0))
    const offline = await loadChangelog(async () => { throw new Error('offline') }, store)
    expect(offline).toMatchObject({ offline: true })
    expect(offline.entries.map((e) => e.id)).toEqual(['PC-1'])
    expect((await loadChangelog(async () => { throw new Error('offline') }, memory())).entries).toEqual([])
  })

  it('shows the dot until What’s new is opened', async () => {
    const store = memory()
    const { entries } = await loadChangelog(async () => log, store)
    expect(await unread(entries, store)).toBe(true)
    await markSeen(entries, store)
    expect(await unread(entries, store)).toBe(false)
    const newer = [...entries, { ...entries[0]!, id: 'PC-2', date: '2026-10-21' }]
    expect(await unread(newer, store)).toBe(true)
  })
})
