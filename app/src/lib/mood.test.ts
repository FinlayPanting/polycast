import { describe, expect, it } from 'vitest'
import { moodPickByline, moodPickRoute } from './mood'
import { searchOrMood, searchOrMoodPlaceholder } from './mood'

describe("Mia's mood picks", () => {
  it('opens an episode directly, and a show by whichever id it has', () => {
    expect(moodPickRoute({ kind: 'episode', episodeId: 'e1', podcastId: 'p1', title: 'Fikan', podcastTitle: 'Svenska Samtal', artwork: null, why: '' })).toBe('/episode/e1')
    expect(moodPickRoute({ kind: 'show', title: 'S', author: null, artwork: null, podcastId: 'p1', why: '' })).toEqual({ pathname: '/show', params: { podcastId: 'p1' } })
    expect(moodPickRoute({ kind: 'show', title: 'S', author: null, artwork: null, appleId: '555', why: '' })).toEqual({ pathname: '/show', params: { appleId: '555' } })
    expect(moodPickRoute({ kind: 'show', title: 'S', author: null, artwork: null, feedUrl: 'https://f/x.xml', why: '' })).toEqual({ pathname: '/show', params: { feedUrl: 'https://f/x.xml' } })
  })

  it('says which show an episode is from', () => {
    expect(moodPickByline({ kind: 'episode', episodeId: 'e1', podcastId: 'p1', title: 'Fikan', podcastTitle: 'Svenska Samtal', artwork: null, why: '' })).toBe('Episode of Svenska Samtal')
    expect(moodPickByline({ kind: 'show', title: 'S', author: 'Anna', artwork: null, why: '' })).toBe('Anna')
  })
})

describe('one search bar, with an AI button', () => {
  it('searches podcasts from the keyboard and asks the guide from the sparkle', () => {
    expect(searchOrMood('  Kaffe ', 'keyboard')).toEqual({ kind: 'search', q: 'Kaffe' })
    expect(searchOrMood('something calm for a rainy day', 'sparkle')).toEqual({ kind: 'mood', mood: 'something calm for a rainy day' })
  })

  it('does nothing with an empty field, or a one-letter search', () => {
    expect(searchOrMood('   ', 'sparkle')).toBeNull()
    expect(searchOrMood('k', 'keyboard')).toBeNull()
    expect(searchOrMood('k', 'sparkle')).toEqual({ kind: 'mood', mood: 'k' })
  })

  it('says both things the bar can do', () => {
    expect(searchOrMoodPlaceholder('Leo')).toBe('Search any podcast, or tell Leo what you fancy')
  })
})
