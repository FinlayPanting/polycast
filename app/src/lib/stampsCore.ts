import { localDay, seasonalStamp, type SeasonStamp } from '@polycast/core'

/**
 * Seasonal stamps (PC-1024-07): a guided episode finished while a season is on earns its stamp.
 * Subtitles-only listens don't. Pure, so it can be tested; storage is in stamps.ts.
 */
export function stampForFinish(listen: { guided: boolean; language: string }, now: Date): SeasonStamp | undefined {
  return listen.guided ? seasonalStamp(listen.language, now) : undefined
}

export const stampId = (s: SeasonStamp) => s.seasonId

/**
 * Fresh off the press (PC-1030-08): a guided episode finished on the (learner's local) day it came out presses
 * a small 'Fresh' stamp into You, at most once a week. Never announced; the guide says one line on the wrap-up.
 */
export const FRESH_STAMP_NAME = 'Fresh'
export const FRESH_LINE = 'Heard the day it aired. Very up to date.'

/** The ISO week of a local day, "2026-W44", so a week's Fresh stamp has one id. */
export function isoWeek(d: Date): string {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (t.getDay() + 6) % 7 // Monday 0
  t.setDate(t.getDate() - day + 3) // that week's Thursday
  const firstThursday = new Date(t.getFullYear(), 0, 4)
  const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
  return `${t.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export function freshStamp(listen: { guided: boolean; language: string; published?: string | null }, now: Date): SeasonStamp | undefined {
  if (!listen.guided || !listen.published) return undefined
  const published = new Date(listen.published)
  if (Number.isNaN(published.getTime()) || published.getTime() > now.getTime() + 60_000 || localDay(published) !== localDay(now)) return undefined
  return { seasonId: `fresh-${isoWeek(now)}`, language: listen.language, name: FRESH_STAMP_NAME, earnedOn: localDay(now) }
}

export const isFreshStamp = (s: SeasonStamp) => s.seasonId.startsWith('fresh-')

/** What the guide says under a newly pressed Fresh stamp. */
export function freshLine(guideName: string): string {
  return `${guideName}: “${FRESH_LINE}”`
}

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
