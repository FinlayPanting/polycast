/**
 * Seasonal mood picks on Discover (PC-1021-08): for a few days around a holiday, one hand-written
 * mood chip per language comes first, with a one-line culture note from the guide. It switches
 * itself off when the dates pass. A template for later seasons: add another entry below.
 */

export interface SeasonalMood {
  /** The chip, sent to the guide like any other mood (English, like the other chips). */
  chip: string
  /** The guide's one-line culture note, shown above the chips. */
  note: string
}

export interface Season {
  id: string
  /**
   * First and last day it shows, inclusive, in the learner's own time zone: MM-DD to come round every year
   * (PC-1026-06; `to` may be in the next year, as with New Year), or YYYY-MM-DD for a one-off.
   */
  from: string
  to: string
  byLanguage: Record<string, SeasonalMood>
  /**
   * A keepsake for finishing a guided episode while the season is on (PC-1024-07), named in the
   * learner's language. Optional: a season without one simply gives none.
   */
  stamp?: Record<string, string>
  /**
   * A later last day (MM-DD) for one language, worked out for the year, when that country keeps the day
   * later than the shared range (PC-1027-07). The season shows until whichever is later.
   */
  lastDayByLanguage?: Record<string, (year: number) => string>
  /** Those later last days in words, for App Review's notes ("in Swedish, until …"). */
  lastDayWords?: string
}

/**
 * Alla helgons dag: the Saturday between 31 October and 6 November (PC-1027-07), as MM-DD.
 * 31 Oct 2026, 6 Nov 2027, 4 Nov 2028, 3 Nov 2029.
 */
export function allaHelgonsDag(year: number): string {
  const oct31 = new Date(Date.UTC(year, 9, 31))
  const d = new Date(Date.UTC(year, 9, 31 + ((6 - oct31.getUTCDay() + 7) % 7)))
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export const SEASONS: Season[] = [
  {
    id: 'all-saints',
    from: '10-28',
    to: '11-02',
    byLanguage: {
      es: {
        chip: 'Something spooky for Día de Muertos',
        note: 'In Mexico, families build altars with marigolds and pan de muerto for Día de Muertos. In Spain, 1 November is Todos los Santos.',
      },
      fr: {
        chip: 'Something spooky for la Toussaint',
        note: 'La Toussaint, on 1 November, is a public holiday in France, and many families take chrysanthemums to their relatives’ graves.',
      },
      de: {
        chip: 'Something spooky for Allerheiligen',
        note: 'Allerheiligen, on 1 November, is a public holiday in Austria and much of southern and western Germany.',
      },
      it: {
        chip: 'Something spooky for Ognissanti',
        note: 'Ognissanti, on 1 November, is a public holiday in Italy, followed by the day of remembrance for the dead on the 2nd.',
      },
      pt: {
        chip: 'Something spooky for Todos-os-Santos',
        note: 'Dia de Todos-os-Santos, on 1 November, is a public holiday in Portugal. In Brazil, Finados on the 2nd is the bigger day.',
      },
      sv: {
        chip: 'Something spooky for Alla helgons dag',
        note: 'Sweden keeps Alla helgons dag on the Saturday between 31 October and 6 November, when people light candles on graves.',
      },
    },
    stamp: { es: 'Todos los Santos', fr: 'Toussaint', de: 'Allerheiligen', it: 'Ognissanti', pt: 'Finados', sv: 'Allhelgona' },
    lastDayByLanguage: { sv: allaHelgonsDag },
    lastDayWords: 'in Swedish, until Alla helgons dag (the Saturday between 31 Oct and 6 Nov) when that is later',
  },
]

/** The learner's local date as YYYY-MM-DD. */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const MONTH_DAY = /^\d{2}-\d{2}$/

/** Whether the dates come round every year (MM-DD) rather than once (YYYY-MM-DD). */
export function isYearly(range: { from: string; to: string }): boolean {
  return MONTH_DAY.test(range.from) && MONTH_DAY.test(range.to)
}

/**
 * Seasons come round every year (PC-1026-06). Whether `now` falls in the range, and if so the year that
 * season started (a New Year season that starts on 26 Dec 2026 is still the 2026 one on 5 Jan 2027).
 */
export function seasonYear(range: { from: string; to: string }, now: Date): number | undefined {
  const day = localDay(now)
  const year = now.getFullYear()
  if (!isYearly(range)) return day >= range.from && day <= range.to ? Number(range.from.slice(0, 4)) : undefined
  const md = day.slice(5)
  if (range.from <= range.to) return md >= range.from && md <= range.to ? year : undefined
  if (md >= range.from) return year
  if (md <= range.to) return year - 1
  return undefined
}

/** A yearly season's id for the year it's in ("all-saints-2026"), so each year is its own; a one-off keeps its id. */
function idFor(s: { id: string; from: string; to: string }, year: number): string {
  return isYearly(s) ? `${s.id}-${year}` : s.id
}

/** A season's dates for one language: its own later last day, if it has one this year (PC-1027-07). */
function rangeFor(s: Season, language: string, now: Date): { from: string; to: string } {
  const later = s.lastDayByLanguage?.[language]?.(now.getFullYear())
  return later && isYearly(s) && s.from <= s.to && later > s.to ? { from: s.from, to: later } : s
}

/** The seasonal mood for this language today, if one is on. */
export function seasonalMood(language: string, now: Date, seasons: Season[] = SEASONS): (SeasonalMood & { seasonId: string }) | undefined {
  for (const s of seasons) {
    const m = s.byLanguage[language]
    const year = m ? seasonYear(rangeFor(s, language, now), now) : undefined
    if (m && year !== undefined) return { ...m, seasonId: idFor(s, year) }
  }
  return undefined
}

/**
 * New Year lines (PC-1023-04): from Boxing Day to mid-January, when most people start learning, the welcome
 * screen and the free plan's card on You speak to New Year learners, then switch themselves off. No discount
 * and no price change: copy and timing only. `{language}` becomes the language's English name.
 */
export interface SeasonalLines {
  id: string
  /** First and last day it shows, inclusive, in the learner's own time zone: MM-DD every year, or YYYY-MM-DD once. */
  from: string
  to: string
  /** Under the welcome screen's introduction, before a language is picked. */
  welcome: string
  /** On the free plan's card in You, above "See Plus". */
  plusCard: string
}

export const SEASONAL_LINES: SeasonalLines[] = [
  {
    id: 'new-year',
    from: '12-26',
    to: '01-18',
    welcome: 'New year, new language? One podcast a week is a gentle way in.',
    plusCard: 'One podcast a week in {language} this year? Plus brings your guide to every episode.',
  },
]

/** The seasonal line for this place today, if one is on. */
export function seasonalLine(place: 'welcome' | 'plusCard', now: Date, languageName = 'your language', lines: SeasonalLines[] = SEASONAL_LINES): string | undefined {
  const s = lines.find((l) => seasonYear(l, now) !== undefined)
  return s?.[place].replace('{language}', languageName)
}

/**
 * Seasonal stamps (PC-1024-07): finishing a guided episode while a season is on earns that season's
 * stamp, once a year (each year's season has its own id), named in the language of the episode. Kept on the phone and never counted as a streak.
 */
export interface SeasonStamp {
  seasonId: string
  language: string
  name: string
  /** The learner's local day it was earned, YYYY-MM-DD. */
  earnedOn: string
}

/** The stamp a guided episode in `language` finished now would earn, if a season with one is on. */
export function seasonalStamp(language: string, now: Date, seasons: Season[] = SEASONS): SeasonStamp | undefined {
  for (const s of seasons) {
    const name = s.stamp?.[language]
    const year = name ? seasonYear(rangeFor(s, language, now), now) : undefined
    if (name && year !== undefined) return { seasonId: idFor(s, year), language, name, earnedOn: localDay(now) }
  }
  return undefined
}

/** The stamps with `stamp` added, unless that season's stamp is already there (one per season). */
export function addStamp(stamps: readonly SeasonStamp[], stamp: SeasonStamp): SeasonStamp[] {
  return stamps.some((s) => s.seasonId === stamp.seasonId) ? [...stamps] : [...stamps, stamp]
}
