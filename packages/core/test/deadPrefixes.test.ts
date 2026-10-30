import { describe, expect, it } from 'vitest'
import { parseFeed, withoutDeadPrefixes } from '../src'

describe('dead measurement prefixes (PC-1029-01)', () => {
  it('takes the Podcorn prefix off, keeping the real address', () => {
    expect(withoutDeadPrefixes('https://pdcn.co/e/traffic.libsyn.com/show/ep1.mp3')).toBe('https://traffic.libsyn.com/show/ep1.mp3')
    expect(withoutDeadPrefixes('https://pdcn.co/e/https://media.example.com/ep1.mp3?x=1')).toBe('https://media.example.com/ep1.mp3?x=1')
    expect(withoutDeadPrefixes('http://www.pdcn.co/e/media.example.com/ep1.mp3')).toBe('http://media.example.com/ep1.mp3')
  })

  it('keeps other measurement links in the chain, which still work', () => {
    expect(withoutDeadPrefixes('https://pdcn.co/e/op3.dev/e/media.example.com/ep1.mp3')).toBe('https://op3.dev/e/media.example.com/ep1.mp3')
    expect(withoutDeadPrefixes('https://op3.dev/e/pdcn.co/e/media.example.com/ep1.mp3')).toBe('https://op3.dev/e/pdcn.co/e/media.example.com/ep1.mp3')
  })

  it('leaves ordinary and odd addresses alone', () => {
    expect(withoutDeadPrefixes('https://media.example.com/pdcn.co/e/ep1.mp3')).toBe('https://media.example.com/pdcn.co/e/ep1.mp3')
    expect(withoutDeadPrefixes('https://pdcn.co/e/')).toBe('https://pdcn.co/e/')
    expect(withoutDeadPrefixes('file:///episodes/ep1.mp3')).toBe('file:///episodes/ep1.mp3')
  })

  it('reads a feed so episodes go straight to the file, keeping their ID', () => {
    const feed = parseFeed(`<?xml version="1.0"?><rss><channel><title>Show</title>
      <item><title>One</title><enclosure url="https://pdcn.co/e/media.example.com/one.mp3" type="audio/mpeg"/></item>
      <item><title>Two</title><guid>two</guid><enclosure url="https://pdcn.co/e/https://media.example.com/two.mp3" type="audio/mpeg"/></item>
    </channel></rss>`)
    expect(feed.episodes.map((e) => e.audioUrl)).toEqual(['https://media.example.com/one.mp3', 'https://media.example.com/two.mp3'])
    // An episode known by its file keeps the ID it already had, so it isn't added twice.
    expect(feed.episodes[0]!.guid).toBe('https://pdcn.co/e/media.example.com/one.mp3')
    expect(feed.episodes[0]!.formerGuid).toBeUndefined()
  })
})
