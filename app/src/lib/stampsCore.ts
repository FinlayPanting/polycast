import { seasonalStamp, type SeasonStamp } from '@polycast/core'

/**
 * Seasonal stamps (PC-1024-07): a guided episode finished while a season is on earns its stamp.
 * Subtitles-only listens don't. Pure, so it can be tested; storage is in stamps.ts.
 */
export function stampForFinish(listen: { guided: boolean; language: string }, now: Date): SeasonStamp | undefined {
  return listen.guided ? seasonalStamp(listen.language, now) : undefined
}

export const stampId = (s: SeasonStamp) => s.seasonId

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Toussaint, 1 Nov 2026": what the stamp says under its name, and what VoiceOver reads. */
export function stampDate(s: SeasonStamp): string {
  const [y, m, d] = s.earnedOn.split('-').map(Number)
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : ''
}
