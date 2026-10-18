import { describe, expect, it } from 'vitest'
import type { Primer } from '@polycast/core'
import { clockTime, earlyPrimerUrl, loadEarlyPrimer, playableClip, primerReveal, primerSource } from './primer'

const primer = (gist: string): Primer => ({ gist, gistNative: 'en', words: [], themes: [] })

describe('the primer on the episode screen (PC-1017-P2, P4)', () => {
  it('prefers the copy saved on the phone, whose clips play offline', () => {
    const r = primerSource({ primer: primer('saved'), audioUrl: 'file:///ep.mp3' }, primer('server'), 'https://x/ep.mp3', true)
    expect(r).toEqual({ primer: primer('saved'), audioUrl: 'file:///ep.mp3' })
  })

  it('shows the server’s primer otherwise, with clips only where they can’t land on the wrong moment', () => {
    expect(primerSource(undefined, primer('server'), 'https://x/ep.mp3', true)).toEqual({ primer: primer('server'), audioUrl: undefined })
    expect(primerSource(undefined, primer('server'), 'https://x/ep.mp3', false)).toEqual({ primer: primer('server'), audioUrl: 'https://x/ep.mp3' })
    expect(primerSource({ audioUrl: 'file:///ep.mp3' }, null, 'https://x', true)).toBeUndefined()
  })

  it('skips clips that only exist in Polycast’s copy', () => {
    expect(playableClip({ start: -1, end: -1 })).toBe(false)
    expect(playableClip({ start: 3, end: 3.6 })).toBe(true)
    expect(playableClip(undefined)).toBe(false)
  })

  it('writes times as minutes and seconds', () => {
    expect(clockTime(42.7)).toBe('0:42')
    expect(clockTime(725)).toBe('12:05')
  })
})

describe('the primer building while Mia prepares (PC-1017-P3)', () => {
  const full: Primer = {
    gist: 'Hej.',
    gistNative: 'Hi.',
    words: [
      { text: 'fika', lemma: 'fika', meaning: 'coffee break', at: 10, clip: { start: 9.9, end: 10.5 } },
      { text: 'sambo', lemma: 'sambo', meaning: 'partner', at: 40, clip: { start: 39.9, end: 40.5 } },
    ],
    themes: [{ title: 'Coffee', at: 5 }],
  }
  const fakeFetch = (status: number, body: unknown) => (async () => ({ ok: status === 200, json: async () => body })) as unknown as typeof fetch

  it('reads it from where the server publishes it', async () => {
    expect(earlyPrimerUrl('https://sb.test', 'ep1')).toBe('https://sb.test/storage/v1/object/public/guide-audio/primer/v1/ep1.json')
    expect(await loadEarlyPrimer('u', fakeFetch(200, full))).toEqual(full)
  })

  it('shows nothing until it really exists, and ignores anything malformed', async () => {
    expect(await loadEarlyPrimer('u', fakeFetch(404, {}))).toBeUndefined()
    expect(await loadEarlyPrimer('u', fakeFetch(200, { gist: 3 }))).toBeUndefined()
    expect(await loadEarlyPrimer('u', (async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeUndefined()
    expect(primerReveal(undefined)).toEqual([])
  })

  it('appears gist first, then each word, then the themes', () => {
    expect(primerReveal(full)).toEqual(['gist', 'word:0', 'word:1', 'themes'])
    expect(primerReveal({ ...full, themes: [] })).toEqual(['gist', 'word:0', 'word:1'])
  })
})
