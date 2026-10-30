import { ONE_SITTING_SEC } from '@polycast/core'
import type { Shelf, ShelfEpisode } from './api'

/**
 * Empty screens with one thing to do (PC-1028-10): the episode an empty Words or Library screen offers,
 * so a new learner who wanders there is one tap from hearing their guide. From Discover's Easy listening
 * shelf, ready episodes only: one that fits in a sitting, then the easiest band, then the shortest;
 * Listener favourites if Easy listening has nothing ready. Undefined when nothing is ready.
 */
export function goodFirstListenFrom(shelves: readonly Shelf[] | undefined): ShelfEpisode | undefined {
  const shelf = (id: string) => ((shelves ?? []).find((s) => s.id === id) as { episodes?: ShelfEpisode[] } | undefined)?.episodes ?? []
  for (const id of ['easy', 'favourites']) {
    const ready = shelf(id).filter((e) => e.ready && e.durationSec > 0)
    if (!ready.length) continue
    const score = (e: ShelfEpisode) => [e.durationSec <= ONE_SITTING_SEC ? 0 : 1, e.difficulty?.band === 'easier' ? 0 : 1, e.durationSec]
    return [...ready].sort((a, b) => {
      const x = score(a)
      const y = score(b)
      const i = x.findIndex((v, k) => v !== y[k])
      return i < 0 ? 0 : x[i]! - y[i]!
    })[0]
  }
  return undefined
}

/** The button's words: what it starts and who's with you. */
export const firstListenLabel = (guideName: string) => `Start a good first listen with ${guideName}`
