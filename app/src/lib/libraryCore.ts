/**
 * A Library built for keeping up (PC-1017-F11): the shows listened to recently, where to carry on,
 * new episodes from followed shows, Listen later and downloads. Pure rules, so they can be tested.
 */

export interface ListenLike {
  episode_id: string
  position_sec: number
  finished_at: string | null
  updated_at: string
  episodes: { title: string; duration_sec: number; image: string | null; podcast_id?: string; podcasts: { title: string; artwork: string | null } }
}

export interface RecentShow {
  podcastId: string
  title: string
  artwork: string | null
}

/** Shows (not episodes) from the most recent listens, each once, newest first. */
export function recentShows(listens: readonly ListenLike[], max = 12): RecentShow[] {
  const seen = new Set<string>()
  const out: RecentShow[] = []
  for (const l of [...listens].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
    const id = l.episodes.podcast_id
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ podcastId: id, title: l.episodes.podcasts.title, artwork: l.episodes.podcasts.artwork ?? l.episodes.image })
    if (out.length >= max) break
  }
  return out
}

/** Episodes started and not finished, most recent first: where to carry on. */
export function carryOn<T extends ListenLike>(listens: readonly T[], max = 5): T[] {
  return listens.filter((l) => !l.finished_at && l.position_sec > 0).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, max)
}

export interface NewEpisode {
  episodeId: string
  title: string
  podcastId: string
  podcastTitle: string
  image: string | null
  durationSec: number
  published: string
  ready: boolean
  /** Only a video file is on offer (PC-1023-09): auto-download leaves it for Wi-Fi. */
  video?: boolean
}

export interface ShowEpisodes {
  podcast: { id: string; title: string; artwork: string | null }
  episodes: { id: string; title: string; published: string | null; duration_sec: number; image: string | null; status: string; video?: boolean }[]
}

/** How far back "new" reaches. */
export const NEW_EPISODE_DAYS = 14

/**
 * New episodes from followed shows: published in the last fortnight, newest first, leaving out
 * any the learner has already started.
 */
export function newEpisodes(shows: readonly ShowEpisodes[], nowMs: number, started: ReadonlySet<string> = new Set(), opts: { days?: number; max?: number } = {}): NewEpisode[] {
  const { days = NEW_EPISODE_DAYS, max = 20 } = opts
  const since = nowMs - days * 86_400_000
  const out: NewEpisode[] = []
  for (const s of shows)
    for (const e of s.episodes) {
      const t = e.published ? Date.parse(e.published) : NaN
      if (!Number.isFinite(t) || t < since || t > nowMs + 86_400_000 || started.has(e.id)) continue
      out.push({ episodeId: e.id, title: e.title, podcastId: s.podcast.id, podcastTitle: s.podcast.title, image: e.image ?? s.podcast.artwork, durationSec: e.duration_sec, published: e.published!, ready: e.status === 'ready', ...(e.video ? { video: true } : {}) })
    }
  return out.sort((a, b) => b.published.localeCompare(a.published)).slice(0, max)
}

/** The Library's sections, in order, with the line shown when each is empty. */
export const LIBRARY_SECTIONS = [
  { id: 'recent', title: 'Recently listened', empty: 'Shows you listen to will appear here.' },
  { id: 'carry-on', title: 'Carry on listening', empty: '' },
  { id: 'new', title: 'New episodes', empty: 'Follow a show to see its new episodes here.' },
  { id: 'later', title: 'Listen later', empty: 'Tap Listen later on any episode to keep it here.' },
  { id: 'downloads', title: 'Downloads', empty: 'Episodes you download for offline will appear here.' },
] as const
