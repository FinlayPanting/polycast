import type { EpisodeDetail, ListenRow } from '../lib/data'
import { art, LISTEN } from './fixtures'

export async function getEpisode(id: string): Promise<{ episode: EpisodeDetail }> {
  return {
    episode: {
      id,
      title: LISTEN.episode.title,
      duration_sec: 24 * 60,
      image: art.samtal as unknown as string,
      status: 'ready',
      difficulty: { label: 'A2–B1, relaxed pace' },
      podcasts: { title: 'Svenska Samtal', artwork: art.samtal as unknown as string },
    },
  }
}

export async function listListens(): Promise<ListenRow[]> {
  const row = (id: string, title: string, image: number, position: number, duration: number, finished = false): ListenRow => ({
    episode_id: id,
    position_sec: position,
    finished_at: finished ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
    episodes: { title, duration_sec: duration, image: image as unknown as string, podcasts: { title: 'Svenska Samtal', artwork: null } },
  })
  return [row('ep1', 'Tåget till Göteborg', art.samtal, 600, 1440), row('ep2', 'Min första midsommar', art.kaffe, 1860, 1860, true)]
}
