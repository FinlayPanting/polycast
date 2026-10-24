import { describe, expect, it } from 'vitest'
import { LANGUAGE_REQUESTS_KEY, languageRequestThanks, requestLanguage } from './languageRequest'

function phone(postOk = true) {
  const store = new Map<string, string>()
  const posts: string[] = []
  return {
    store,
    posts,
    deps: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      post: async (l: string) => (posts.push(l), postOk),
    },
  }
}

describe('Learning something else? (PC-1023-02)', () => {
  it('sends each language once per install, with only the language', async () => {
    const p = phone()
    expect(await requestLanguage('nl', p.deps)).toBe('sent')
    expect(await requestLanguage('nl', p.deps)).toBe('already')
    expect(await requestLanguage('ja', p.deps)).toBe('sent')
    expect(p.posts).toEqual(['nl', 'ja'])
    expect(JSON.parse(p.store.get(LANGUAGE_REQUESTS_KEY)!)).toEqual(['nl', 'ja'])
  })

  it('tries again next time if the send failed', async () => {
    const p = phone(false)
    expect(await requestLanguage('nl', p.deps)).toBe('failed')
    expect(p.store.has(LANGUAGE_REQUESTS_KEY)).toBe(false)
  })

  it('survives a broken stored list', async () => {
    const p = phone()
    p.store.set(LANGUAGE_REQUESTS_KEY, 'not json')
    expect(await requestLanguage('nl', p.deps)).toBe('failed')
  })

  it('thanks warmly without promising a date', () => {
    expect(languageRequestThanks('Dutch', 'nl')).toContain('Dutch')
    for (const s of [languageRequestThanks('Dutch', 'nl'), languageRequestThanks('Something else', 'other')]) {
      expect(s).not.toMatch(/!|soon|coming in/i)
    }
  })
})
