import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nowPlayingTrack } from './nowPlaying'

const episode = { title: 'Avsnitt 12: Fika', podcastTitle: 'Svenska med Anna', audioUrl: 'https://feed.example/12.mp3', image: 'https://feed.example/art.jpg', durationSec: 1800 }

describe('the lock screen during a listen (PC-1020-R2)', () => {
  it("shows the episode's title and the show's name", () => {
    expect(nowPlayingTrack(episode)).toEqual({ url: episode.audioUrl, title: 'Avsnitt 12: Fika', artist: 'Svenska med Anna', artwork: episode.image, durationSec: 1800 })
  })

  it('leaves artwork out when the episode has none', () => {
    expect(nowPlayingTrack({ ...episode, image: null }).artwork).toBeUndefined()
  })

  it('is never replaced mid-listen by the subtitle line', () => {
    const audio = readFileSync(new URL('./trackPlayerAudio.ts', import.meta.url), 'utf8')
    const provider = readFileSync(new URL('./PlayerProvider.tsx', import.meta.url), 'utf8')
    expect(audio).not.toMatch(/updateNowPlayingMetadata|updateMetadataForTrack/)
    expect(provider).not.toMatch(/setNowPlaying|lockScreenLine/)
  })
})
