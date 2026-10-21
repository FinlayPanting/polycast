import type { EpisodeAudio } from './types'

type Track = Parameters<EpisodeAudio['load']>[0]

/**
 * What the lock screen and Control Centre show for a listen: the episode's title and the show's
 * name, for the whole listen (PC-1020-R2). Set once when the episode loads; nothing replaces it
 * while the learner listens.
 */
export function nowPlayingTrack(episode: { title: string; podcastTitle: string; audioUrl: string; image: string | null; durationSec: number }): Track {
  return { url: episode.audioUrl, title: episode.title, artist: episode.podcastTitle, artwork: episode.image ?? undefined, durationSec: episode.durationSec }
}
