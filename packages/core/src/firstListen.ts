import type { DifficultyBand } from './difficulty'

export interface FirstListenCandidate {
  id: string
  duration_sec: number
  difficulty?: { band: DifficultyBand } | null
}

/** An episode a new learner can finish in one sitting: typical podcast sessions run about 27 minutes. */
export const ONE_SITTING_SEC = 30 * 60

const BAND_RANK: Record<DifficultyBand, number> = { easier: 0, moderate: 1, challenging: 3 }
/** Not prepared yet, so its difficulty is unknown: between moderate and challenging. */
const UNKNOWN_RANK = 2

/**
 * The episode to tag "Good first listen" on a show's page: among the latest few (newest first, as
 * listed), the easiest, preferring one that fits in one sitting, then the shorter, then the newer.
 * Nothing is tagged when the show lists fewer than two episodes, since there's no choice to help with.
 */
export function goodFirstListen(episodes: FirstListenCandidate[], latest = 5): string | undefined {
  const pool = episodes.slice(0, latest).filter((e) => e.duration_sec > 0)
  if (pool.length < 2) return undefined
  const score = (e: FirstListenCandidate) => [
    e.duration_sec <= ONE_SITTING_SEC ? 0 : 1,
    e.difficulty ? BAND_RANK[e.difficulty.band] : UNKNOWN_RANK,
    e.duration_sec,
  ]
  let best = pool[0]!
  for (const e of pool.slice(1)) {
    const a = score(e)
    const b = score(best)
    const i = a.findIndex((v, k) => v !== b[k])
    if (i >= 0 && a[i]! < b[i]!) best = e
  }
  return best.id
}
