import { describe, expect, it } from 'vitest'
import { fromParam, miniPlayerView, openDecision, parseLastPlayed, sessionKey } from './session'

const last = { id: 'ep1', title: 'Fika', podcastTitle: 'Kaffe med Anna', image: null, durationSec: 1000 }

describe('a listen that outlives the player screen', () => {
  it('re-attaches to the listen in progress instead of starting again', () => {
    const key = sessionKey({ id: 'ep1', level: 'standard' })
    expect(openDecision(key, { id: 'ep1', level: 'standard' })).toBe('reuse')
    expect(openDecision(key, { id: 'ep1', level: 'standard', from: 120 })).toBe('seek')
    expect(openDecision(key, { id: 'ep2', level: 'standard' })).toBe('restart')
    expect(openDecision(key, { id: 'ep1', guide: '0' })).toBe('restart')
    expect(openDecision(undefined, { id: 'ep1' })).toBe('restart')
    expect(openDecision(key, { id: 'ep1', level: 'standard' }, true)).toBe('restart')
  })

  it('reads a jump from the episode map', () => {
    expect(fromParam('42.5')).toBe(42.5)
    expect(fromParam('-3')).toBe(0)
    expect(fromParam('soon')).toBeUndefined()
    expect(fromParam(undefined)).toBeUndefined()
  })
})

describe('the mini-player', () => {
  it('shows the listen in progress, playing or paused', () => {
    const v = miniPlayerView({ id: 'ep1', title: 'Fika', podcastTitle: 'Kaffe', image: null, durationSec: 1000, phase: 'guide', position: 250, failed: false }, undefined, undefined)
    expect(v).toMatchObject({ kind: 'live', playing: true, loading: false, progress: 0.25 })
    expect(miniPlayerView({ id: 'ep1', phase: 'paused', position: 0, failed: false }, last, 0)).toMatchObject({ kind: 'live', playing: false, title: 'Fika' })
  })

  it('after reopening the app, has the last episode waiting, paused where it was left', () => {
    expect(miniPlayerView(undefined, last, 500)).toEqual({ kind: 'resume', id: 'ep1', title: 'Fika', podcastTitle: 'Kaffe med Anna', image: null, progress: 0.5 })
  })

  it('stays out of the way with nothing to carry on', () => {
    expect(miniPlayerView(undefined, undefined, undefined)).toEqual({ kind: 'hidden' })
    expect(miniPlayerView({ id: 'ep1', phase: 'loading', position: 0, failed: true }, undefined, undefined)).toEqual({ kind: 'hidden' })
  })

  it('reads back what it kept, and ignores anything broken', () => {
    expect(parseLastPlayed(JSON.stringify({ ...last, level: 'handsOn' }))).toEqual({ ...last, guide: undefined, level: 'handsOn' })
    expect(parseLastPlayed(JSON.stringify({ ...last, guide: '0', level: 'loud' }))).toMatchObject({ guide: '0', level: undefined })
    expect(parseLastPlayed('{oops')).toBeUndefined()
    expect(parseLastPlayed(JSON.stringify({ id: 1 }))).toBeUndefined()
    expect(parseLastPlayed(null)).toBeUndefined()
  })
})
