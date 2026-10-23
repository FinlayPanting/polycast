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
  /** First and last day it shows, inclusive, as YYYY-MM-DD in the learner's own time zone. */
  from: string
  to: string
  byLanguage: Record<string, SeasonalMood>
}

export const SEASONS: Season[] = [
  {
    id: 'all-saints-2026',
    from: '2026-10-28',
    to: '2026-11-02',
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
  },
]

/** The learner's local date as YYYY-MM-DD. */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The seasonal mood for this language today, if one is on. */
export function seasonalMood(language: string, now: Date, seasons: Season[] = SEASONS): (SeasonalMood & { seasonId: string }) | undefined {
  const day = localDay(now)
  for (const s of seasons) {
    const m = s.byLanguage[language]
    if (m && day >= s.from && day <= s.to) return { ...m, seasonId: s.id }
  }
  return undefined
}
