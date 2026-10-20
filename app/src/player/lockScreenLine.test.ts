import type { Segment } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { lockScreenLine, nowPlayingAt, type NowPlaying } from './lockScreenLine'

const segments: Segment[] = [
  { id: 's1', start: 10, end: 12, text: 'Tåget är försenat igen.', translation: 'The train is late again.', wordStart: 0, wordEnd: 4 },
  { id: 's2', start: 13, end: 14, text: 'Typiskt.', translation: '', wordStart: 4, wordEnd: 5 },
]
const episode = { title: 'Tåget', podcastTitle: 'Svenska Samtal' }

describe('the line you are hearing, on the lock screen (PC-1020-08)', () => {
  it('shows the line with its English underneath', () => {
    expect(nowPlayingAt(segments, 11, episode, 'both').info).toEqual({ title: 'Tåget är försenat igen.', artist: 'The train is late again.' })
  })
  it('falls back to the show under a line without a translation, or with English hidden', () => {
    expect(nowPlayingAt(segments, 13.5, episode, 'both').info).toEqual({ title: 'Typiskt.', artist: 'Svenska Samtal' })
    expect(nowPlayingAt(segments, 11, episode, 'target').info).toEqual({ title: 'Tåget är försenat igen.', artist: 'Svenska Samtal' })
  })
  it('shows the episode before the first line and with subtitles off', () => {
    expect(nowPlayingAt(segments, 5, episode, 'both').info).toEqual({ title: 'Tåget', artist: 'Svenska Samtal' })
    expect(nowPlayingAt(segments, 11, episode, 'none').info).toEqual({ title: 'Tåget', artist: 'Svenska Samtal' })
  })
  it('updates once per line, however often progress arrives', () => {
    const sent: NowPlaying[] = []
    const l = lockScreenLine((i) => sent.push(i))
    for (let t = 9; t < 14.5; t += 0.25) l.at(segments, t, episode, 'both')
    expect(sent.map((s) => s.title)).toEqual(['Tåget', 'Tåget är försenat igen.', 'Typiskt.'])
    l.reset()
    l.at(segments, 14.2, episode, 'both')
    expect(sent).toHaveLength(4)
  })
})
