/**
 * Lists the learner keeps on the phone: episodes to listen to later (PC-1017-F10) and shows they
 * follow (PC-1017-F09). Pure rules here, so they can be tested; storage lives in keptList.ts.
 */

export interface LaterEpisode {
  episodeId: string
  title: string
  podcastTitle: string
  image: string | null
  durationSec: number
  addedAt: string
}

export interface FollowedShow {
  podcastId: string
  title: string
  author: string | null
  artwork: string | null
  followedAt: string
}

/** Long enough for any real backlog, short enough that the list never weighs on the phone. */
export const KEPT_LIST_MAX = 300

/** The list with `item` added at the top, or taken out if it was already there. */
export function toggleKept<T>(list: readonly T[], item: T, idOf: (t: T) => string, max = KEPT_LIST_MAX): T[] {
  const id = idOf(item)
  if (list.some((t) => idOf(t) === id)) return list.filter((t) => idOf(t) !== id)
  return [item, ...list].slice(0, max)
}

export function removeKept<T>(list: readonly T[], id: string, idOf: (t: T) => string): T[] {
  return list.filter((t) => idOf(t) !== id)
}

export function hasKept<T>(list: readonly T[], id: string, idOf: (t: T) => string): boolean {
  return list.some((t) => idOf(t) === id)
}

/** A stored list read back safely: anything unreadable or malformed is an empty list, never a crash. */
export function parseKept<T>(raw: string | null | undefined, idOf: (t: T) => string): T[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    const seen = new Set<string>()
    return v.filter((t) => {
      if (!t || typeof t !== 'object') return false
      const id = idOf(t as T)
      if (typeof id !== 'string' || !id || seen.has(id)) return false
      seen.add(id)
      return true
    }) as T[]
  } catch {
    return []
  }
}

export const laterId = (e: LaterEpisode) => e.episodeId
export const followId = (s: FollowedShow) => s.podcastId

/** The label on the Listen later button, and what VoiceOver reads. */
export function laterLabel(saved: boolean): string {
  return saved ? 'In Listen later' : 'Listen later'
}

export function followLabel(following: boolean): string {
  return following ? 'Following' : 'Follow'
}
