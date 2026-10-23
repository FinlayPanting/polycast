import { describe, expect, it } from 'vitest'
import { POLYCAST_USER_AGENT, audioHeaders, audioSource } from './userAgent'

describe('Polycast names itself on audio requests', () => {
  it('matches the pattern hosts use to recognise Polycast', () => {
    expect(POLYCAST_USER_AGENT).toMatch(/^Polycast\/1\.0/)
  })
  it('adds the header to web addresses only', () => {
    expect(audioHeaders('https://cdn.example/ep.mp3')).toEqual({ 'User-Agent': POLYCAST_USER_AGENT })
    expect(audioHeaders('HTTP://cdn.example/ep.mp3')).toEqual({ 'User-Agent': POLYCAST_USER_AGENT })
    expect(audioHeaders('file:///docs/episodes/a.mp3')).toBeUndefined()
  })
  it('gives expo-audio a source with headers when it streams, the plain path for a file on the phone', () => {
    expect(audioSource('https://cdn.example/ep.mp3')).toEqual({ uri: 'https://cdn.example/ep.mp3', headers: { 'User-Agent': POLYCAST_USER_AGENT } })
    expect(audioSource('file:///docs/episodes/a.mp3')).toBe('file:///docs/episodes/a.mp3')
  })
})
