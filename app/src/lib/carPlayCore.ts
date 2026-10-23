import type { LastPlayed } from '../player/session'
import { newestEpisodeRoute, type ShortcutRoute } from './shortcutsCore'

/**
 * CarPlay (PC-1022-10, step 1 of 2): Polycast in the car shows "Carry on" and the learner's followed
 * shows. Picking one plays through the car with the guide stepping in as usual; the subtitles stay
 * on the phone. The car screen only lists; the phone runs the listen, exactly as it would from
 * the Siri shortcuts, so the native side passes "continue" or "show:<id>" (see shortcutsCore).
 */
export interface CarPlayItem {
  /** "continue" or "show:<podcast id>", handed back when the item is picked. */
  id: string
  title: string
  detail?: string
}

/** Long lists are hard to use while driving; CarPlay also caps list length on some cars. */
export const CARPLAY_MAX_SHOWS = 12

export function carPlayItems(last: LastPlayed | undefined, shows: readonly { podcastId: string; title: string }[]): CarPlayItem[] {
  const items: CarPlayItem[] = []
  if (last) items.push({ id: 'continue', title: 'Carry on', detail: `${last.title} · ${last.podcastTitle}` })
  for (const s of shows.slice(0, CARPLAY_MAX_SHOWS)) items.push({ id: `show:${s.podcastId}`, title: s.title })
  return items
}

export const CARPLAY_EMPTY = 'Follow a show on your phone and it will be here.'
export const CARPLAY_NOT_READY = 'Nothing from this show is ready yet. Get an episode ready on your phone first.'

export type CarPlayOutcome = { play: ShortcutRoute } | { message: string }

/**
 * A show picked in the car: its newest ready episode plays (the newest one, or the newest that is
 * ready). Preparing needs a tap on the phone, so a show with nothing ready says so instead of
 * opening a page nobody can see while driving.
 */
export function carPlayShowOutcome(podcastId: string, episodes: readonly { id: string; status: string; published?: string | null }[]): CarPlayOutcome {
  const ready = episodes.filter((e) => e.status === 'ready')
  if (ready.length === 0) return { message: CARPLAY_NOT_READY }
  return { play: newestEpisodeRoute(podcastId, ready) }
}
