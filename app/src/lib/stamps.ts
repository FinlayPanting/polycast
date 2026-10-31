import type { SeasonStamp } from '@polycast/core'
import { KeptList } from './keptList'
import { freshStamp, stampForFinish, stampId } from './stampsCore'

/** Seasonal stamps, kept on this phone like Listen later (PC-1024-07). Never counted as a streak. */
export const seasonStamps = new KeptList<SeasonStamp>('polycast.stamps.v1', stampId)

/**
 * Called when a listen finishes: keeps the season's stamp and the week's Fresh stamp (PC-1030-08) if this
 * listen earns them. Resolves to a stamp only the first time it's earned, so the wrap-up presses it once;
 * the season's comes first if both are new.
 */
export async function keepStampFor(listen: { guided: boolean; language: string; published?: string | null }, now = new Date()): Promise<SeasonStamp | undefined> {
  let pressed: SeasonStamp | undefined
  for (const stamp of [stampForFinish(listen, now), freshStamp(listen, now)]) {
    if (stamp && (await seasonStamps.add(stamp).catch(() => false))) pressed ??= stamp
  }
  return pressed
}
