import type { MoodPick } from './api'

/** Where tapping one of Mia's mood picks goes: the episode, or the show's page. */
export function moodPickRoute(p: MoodPick): string | { pathname: '/show'; params: Record<string, string> } {
  if (p.kind === 'episode') return `/episode/${p.episodeId}`
  if (p.podcastId) return { pathname: '/show', params: { podcastId: p.podcastId } }
  if (p.appleId) return { pathname: '/show', params: { appleId: p.appleId } }
  return { pathname: '/show', params: { feedUrl: p.feedUrl ?? '' } }
}

/** The line under a pick's title. */
export function moodPickByline(p: MoodPick): string {
  return p.kind === 'episode' ? `Episode of ${p.podcastTitle}` : (p.author ?? '')
}
