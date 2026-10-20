import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./config', () => ({ config: { demo: false } }))
vi.mock('./episodeAudio', () => ({ clipAudio: () => undefined }))
vi.mock('../demo/session', () => ({ DEMO_WORDS: [] }))

const { saveWordWith, SAVE_WORD_FAILED } = await import('./words')
type Store = Parameters<typeof saveWordWith>[0]

/** A saved-words table with one row per learner, language and word, like the real one. */
function table(opts: { failInsert?: boolean; failUpdate?: number; failRead?: boolean } = {}) {
  const rows = new Map<string, string[]>()
  let updatesToFail = opts.failUpdate ?? 0
  const calls: string[] = []
  const store: Store = {
    async insert(row) {
      calls.push('insert')
      await Promise.resolve() // the network: another tap can get in between
      if (opts.failInsert) return { error: { code: '08006', message: 'offline' } }
      const k = `${row.user_id}|${row.language}|${row.lemma}`
      if (rows.has(k)) return { error: { code: '23505', message: 'duplicate key' } }
      rows.set(k, row.forms as string[])
      return { error: null }
    },
    async forms(k) {
      calls.push('read')
      if (opts.failRead) return { error: { message: 'offline' } }
      return { forms: rows.get(`${k.userId}|${k.language}|${k.lemma}`), error: null }
    },
    async setForms(k, forms) {
      calls.push('update')
      if (updatesToFail-- > 0) return { error: { message: 'timeout' } }
      rows.set(`${k.userId}|${k.language}|${k.lemma}`, forms)
      return { error: null }
    },
  }
  return { store, rows, calls }
}

const word = (form = 'huset', episodeId = 'ep1') => ({ lemma: 'hus', form, meaning: 'house', language: 'sv', episodeId, clip: { start: 1, end: 2 } as any, sentence: 'Huset är rött.' })

describe('saving a word (PC-1018-02)', () => {
  it('two quick taps are one save, and neither shows an error', async () => {
    const t = table()
    await expect(Promise.all([saveWordWith(t.store, 'u1', word()), saveWordWith(t.store, 'u1', word())])).resolves.toBeDefined()
    expect(t.rows.get('u1|sv|hus')).toEqual(['huset'])
    expect(t.calls.filter((c) => c === 'insert')).toHaveLength(1)
  })

  it('saving again from another episode merges the new form in', async () => {
    const t = table()
    await saveWordWith(t.store, 'u1', word('huset'))
    await saveWordWith(t.store, 'u1', word('hus', 'ep2'))
    await saveWordWith(t.store, 'u1', word('hus', 'ep3')) // a form it already has: nothing to change
    expect(t.rows.get('u1|sv|hus')).toEqual(['huset', 'hus'])
  })

  it('two different forms tapped at once both end up saved, with no false error', async () => {
    const t = table()
    await Promise.all([saveWordWith(t.store, 'u1', word('huset')), saveWordWith(t.store, 'u1', word('husen'))])
    expect(t.rows.get('u1|sv|hus')?.sort()).toEqual(['husen', 'huset'])
  })

  it('a failed merge retries once, and says so only if it really failed', async () => {
    const once = table({ failUpdate: 1 })
    await saveWordWith(once.store, 'u1', word('huset'))
    await expect(saveWordWith(once.store, 'u1', word('husen'))).resolves.toBeUndefined()
    expect(once.rows.get('u1|sv|hus')).toEqual(['huset', 'husen'])

    const always = table({ failUpdate: 5 })
    await saveWordWith(always.store, 'u1', word('huset'))
    await expect(saveWordWith(always.store, 'u1', word('husen'))).rejects.toThrow(SAVE_WORD_FAILED)
  })

  it('a save that never reached the bank is an error, never shown as saved', async () => {
    await expect(saveWordWith(table({ failInsert: true }).store, 'u1', word())).rejects.toThrow(SAVE_WORD_FAILED)
    const unreadable = table({ failRead: true })
    await saveWordWith(unreadable.store, 'u1', word('huset'))
    await expect(saveWordWith(unreadable.store, 'u1', word('husen'))).rejects.toThrow(SAVE_WORD_FAILED)
  })
})
