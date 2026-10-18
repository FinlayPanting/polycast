import { describe, expect, it } from 'vitest'
import type { Primer } from '@polycast/core'
import { clockTime, playableClip, primerSource } from './primer'

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
