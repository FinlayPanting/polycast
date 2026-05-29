import type { Episode } from './rss'
import type { ItunesResult } from './itunes'

interface EpisodeNav {
  episode: Episode
  podcast: ItunesResult
}

const episodeStore = new Map<string, EpisodeNav>()
const podcastStore = new Map<string, ItunesResult>()

export function setEpisodeNav(id: string, data: EpisodeNav): void {
  episodeStore.set(id, data)
}

export function getEpisodeNav(id: string): EpisodeNav | null {
  return episodeStore.get(id) ?? null
}

export function setPodcastNav(id: string, data: ItunesResult): void {
  podcastStore.set(id, data)
}

export function getPodcastNav(id: string): ItunesResult | null {
  return podcastStore.get(id) ?? null
}
