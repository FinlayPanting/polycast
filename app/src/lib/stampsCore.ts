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

/**
 * The stamp landing on the wrap-up (PC-1027-08): pressed onto the page, settling in about half a second,
 * with one gentle tap. With Reduce Motion on it simply appears, still. Pure, so the timings can be tested.
 */
export const STAMP_PRESS = { fromScale: 1.35, fromRotateDeg: -8, pressMs: 260, settleMs: 220, tapAtMs: 260 } as const

export function stampPress(reduceMotion: boolean): { animate: boolean; tapAtMs: number } {
  return reduceMotion ? { animate: false, tapAtMs: 0 } : { animate: true, tapAtMs: STAMP_PRESS.tapAtMs }
}

/** What the wrap-up says above a newly earned stamp, and what VoiceOver reads. */
export function stampEarnedLabel(s: SeasonStamp): string {
  return `New stamp: ${s.name}, ${stampDate(s)}. It's in You.`
}
