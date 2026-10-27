import { isYearly, SEASONAL_LINES, SEASONS } from './seasonal'

/**
 * Features that switch themselves on by date or time (PC-1026-05). Apple's 16 Oct 2026 guidelines (2.5.19)
 * forbid hidden or dormant features, so Notes for Review name each one, when it shows and how a reviewer can
 * see it now. Built from the seasons and lines themselves, so a new season is listed without anyone
 * remembering to.
 */

/** Night owl (PC-1025-06): from 11 pm until 4 am on the phone's clock, the guide's goodbye is a goodnight. */
export const NIGHT_OWL = { fromHour: 23, untilHour: 4 }

export interface DateSwitchedFeature {
  id: string
  name: string
  /** When it shows, in words. */
  when: string
  /** How a reviewer sees it today. */
  howToSee: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "28 Oct" from "2026-10-28" or "10-28". */
export function dayMonth(date: string): string {
  const m = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  return `${Number(m[2])} ${MONTHS[Number(m[1]) - 1] ?? m[1]}`
}

/** "28 Oct to 2 Nov every year", from a season's first and last day (no "every year" for a one-off). */
export function dayRange(from: string, to: string): string {
  return `${dayMonth(from)} to ${dayMonth(to)}${isYearly({ from, to }) ? ' every year' : ''}`
}

const hour = (h: number) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h} am` : `${h - 12} pm`)
const SET_DATE = 'set the iPhone’s date in Settings → General → Date & Time (turn off Set Automatically)'

export function dateSwitchedFeatures(): DateSwitchedFeature[] {
  const out: DateSwitchedFeature[] = []
  for (const s of SEASONS) {
    const when = dayRange(s.from, s.to)
    out.push({
      id: `${s.id}-mood`,
      name: `Seasonal mood pick on Discover (${s.id})`,
      when,
      howToSee: `${SET_DATE} to ${dayMonth(s.from)}, then open Discover: the first mood chip and a one-line culture note are seasonal.`,
    })
    if (s.stamp) {
      out.push({
        id: `${s.id}-stamp`,
        name: `Seasonal stamp in You (${s.id})`,
        when,
        howToSee: `${SET_DATE} to ${dayMonth(s.from)}, finish a guided episode, then open You.`,
      })
    }
  }
  for (const l of SEASONAL_LINES) {
    out.push({
      id: l.id,
      name: `Seasonal lines on the welcome screen and the free plan’s card in You (${l.id})`,
      when: dayRange(l.from, l.to),
      howToSee: `${SET_DATE} to ${dayMonth(l.from)}, then sign out to see the welcome screen, or open You on the free plan.`,
    })
  }
  out.push({
    id: 'night-owl',
    name: 'Night owl: the guide says goodnight instead of goodbye',
    when: `${hour(NIGHT_OWL.fromHour)} to ${hour(NIGHT_OWL.untilHour)} on the iPhone’s clock`,
    howToSee: `set the iPhone’s time after ${hour(NIGHT_OWL.fromHour)} in Settings → General → Date & Time, then finish a guided episode.`,
  })
  return out
}

/** The Notes for Review section listing them, one line each. */
export function dateSwitchedNotes(features: readonly DateSwitchedFeature[] = dateSwitchedFeatures()): string {
  if (!features.length) return ''
  return [
    'Features that switch on by date or time (nothing is hidden; each can be seen today):',
    ...features.map((f) => `- ${f.name}: shows ${f.when}. To see it, ${f.howToSee}`),
  ].join('\n')
}
