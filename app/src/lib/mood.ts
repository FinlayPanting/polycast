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

/**
 * One field for both (PC-1017-F07): pressing search on the keyboard does a normal podcast search;
 * the sparkle button sends the same words to the guide's mood search. Nothing for an empty field,
 * or a search under two letters (search needs at least two).
 */
export function searchOrMood(text: string, via: 'keyboard' | 'sparkle'): { kind: 'search'; q: string } | { kind: 'mood'; mood: string } | null {
  const t = text.trim()
  if (via === 'sparkle') return t ? { kind: 'mood', mood: t } : null
  return t.length >= 2 ? { kind: 'search', q: t } : null
}

export const searchOrMoodPlaceholder = (guideName: string) => `Search any podcast, or tell ${guideName} what you fancy`
