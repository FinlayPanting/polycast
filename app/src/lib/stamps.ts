import type { SeasonStamp } from '@polycast/core'
import { KeptList } from './keptList'
import { stampForFinish, stampId } from './stampsCore'

/** Seasonal stamps, kept on this phone like Listen later (PC-1024-07). Never counted as a streak. */
export const seasonStamps = new KeptList<SeasonStamp>('polycast.stamps.v1', stampId)

/** Called when a listen finishes: keeps the season's stamp if this listen earns one. */
export function keepStampFor(listen: { guided: boolean; language: string }, now = new Date()): void {
  const stamp = stampForFinish(listen, now)
  if (stamp) void seasonStamps.add(stamp)
}
