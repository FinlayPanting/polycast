import type { LastPlayed } from '../player/session'

/**
 * App Shortcuts (PC-1021-09): "Carry on listening" and "Play the newest episode" from Siri,
 * Spotlight or the Action button. The native side opens the app and leaves a note; these pure
 * rules turn it into a screen.
 */
export type ShortcutAction = { kind: 'continue' } | { kind: 'show'; podcastId: string }

export function parseShortcut(raw: string | null | undefined): ShortcutAction | undefined {
  if (raw === 'continue') return { kind: 'continue' }
  const m = raw?.match(/^show:([0-9a-f-]{36})$/i)
  return m ? { kind: 'show', podcastId: m[1]! } : undefined
}

export type ShortcutRoute = { pathname: '/listen/[id]'; params: Record<string, string> } | { pathname: '/episode/[id]'; params: { id: string } } | { pathname: '/show'; params: { podcastId: string } } | { pathname: '/library' }

/** Carry on: the last episode, as it was being heard; with none, the Library. */
export function continueRoute(last: LastPlayed | undefined): ShortcutRoute {
  if (!last) return { pathname: '/library' }
  return { pathname: '/listen/[id]', params: { id: last.id, guide: last.guide === '0' ? '0' : '1', ...(last.level ? { level: last.level } : {}) } }
}

/**
 * The newest episode of a show: straight into the lesson if it's ready, else its page (where it can
 * be prepared), or the show if it has no episodes yet. Nothing is prepared or spent on its own.
 */
export function newestEpisodeRoute(podcastId: string, episodes: readonly { id: string; status: string; published?: string | null }[]): ShortcutRoute {
  const newest = [...episodes].sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''))[0]
  if (!newest) return { pathname: '/show', params: { podcastId } }
  if (newest.status === 'ready') return { pathname: '/listen/[id]', params: { id: newest.id, guide: '1' } }
  return { pathname: '/episode/[id]', params: { id: newest.id } }
}

/** Followed shows as the shortcut offers them. */
export const shortcutShows = (shows: readonly { podcastId: string; title: string }[]) => shows.map((s) => ({ id: s.podcastId, title: s.title }))
