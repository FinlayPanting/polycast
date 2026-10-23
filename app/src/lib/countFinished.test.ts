import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The learner's listens: episode id → finished? */
let listens: Record<string, boolean> = {}
let offline = false

function query() {
  const filters: ((id: string) => boolean)[] = []
  const q = {
    select: () => q,
    not: (col: string) => (expect(col).toBe('finished_at'), filters.push((id) => listens[id]!), q),
    neq: (col: string, v: string) => (expect(col).toBe('episode_id'), filters.push((id) => id !== v), q),
    then: (resolve: (r: { count: number | null; error: unknown }) => void) =>
      resolve(offline ? { count: null, error: { message: 'offline' } } : { count: Object.keys(listens).filter((id) => filters.every((f) => f(id))).length, error: null }),
  }
  return q
}

vi.mock('./supabase', () => ({ supabase: { from: () => query() } }))
vi.mock('./config', () => ({ config: { demo: false } }))
vi.mock('./offline', () => ({ listSavedLessons: () => [], loadLesson: () => undefined, localPosition: () => undefined, savePositionLocally: () => {} }))
vi.mock('../demo/data', () => ({}))

const { countFinished } = await import('./data')

beforeEach(() => {
  listens = {}
  offline = false
})

describe('podcasts completed on the recap card (PC-1020-04)', () => {
  it('counts the very first episode even before its finish is saved', async () => {
    listens = { ep1: false }
    expect(await countFinished('ep1')).toBe(1)
  })
  it('counts the one just finished alongside earlier ones', async () => {
    listens = { a: true, b: true, ep: false }
    expect(await countFinished('ep')).toBe(3)
  })
  it('counts a re-listen once, whether or not its finish has been saved again', async () => {
    listens = { a: true, ep: true }
    expect(await countFinished('ep')).toBe(2)
  })
  it('says nothing offline', async () => {
    offline = true
    expect(await countFinished('ep')).toBeUndefined()
  })
  it('without an episode, counts what is saved', async () => {
    listens = { a: true, b: false }
    expect(await countFinished()).toBe(1)
  })
})
