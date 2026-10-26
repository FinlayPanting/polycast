import type { SavedWord } from '@polycast/core'

/**
 * A word from your shows on the Home Screen (PC-1025-08). The app shares up to WIDGET_WORDS recent
 * saved words with the widget; it shows one a day. Keep in step with targets/word-widget/WordWidget.swift.
 */
export const WIDGET_GROUP = 'group.com.finlaypanting.polycast'
export const WIDGET_KEY = 'widgetWords'
export const WIDGET_KIND = 'WordWidget'
export const WIDGET_WORDS = 30

export interface WidgetWord {
  lemma: string
  sentence: string
  meaning: string
  language: string
}

/** The words the widget gets: the most recent first (as listed), with the host's line trimmed for a small screen. */
export function widgetWords(words: readonly SavedWord[]): WidgetWord[] {
  return words.slice(0, WIDGET_WORDS).map((w) => ({
    lemma: w.lemma,
    sentence: w.source.sentence.length > 140 ? `${w.source.sentence.slice(0, 139).trimEnd()}…` : w.source.sentence,
    meaning: w.meaning,
    language: w.language,
  }))
}

/** Days since 1 January 1970 on the phone's own clock, so the word changes at local midnight. */
export function localDayNumber(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000)
}

/** The same pick the widget makes for a day. */
export function wordOfTheDay<T>(words: readonly T[], date: Date): T | undefined {
  if (!words.length) return undefined
  return words[((localDayNumber(date) % words.length) + words.length) % words.length]
}

/** The link the widget opens: polycast://word?lemma=…&language=… → the app's /word screen. */
export function wordFromLink(params: { lemma?: string | string[]; language?: string | string[] }): { lemma: string; language: string } | undefined {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const lemma = one(params.lemma)?.trim()
  const language = one(params.language)?.trim()
  return lemma && language && /^[a-z]{2,3}$/.test(language) && lemma.length <= 80 ? { lemma, language } : undefined
}
