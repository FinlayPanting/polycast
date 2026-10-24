import { LAUNCH_LANGUAGES } from './types'

/**
 * "Learning something else?" (PC-1023-02): languages a learner can ask for under the six launch languages.
 * Each tap is counted per day and language with nothing that identifies anyone, so Finlay can see which
 * language to add next. 'other' covers anything not listed.
 */
export const REQUESTABLE_LANGUAGES = [
  { code: 'nl', name: 'Dutch' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ca', name: 'Catalan' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Mandarin' },
  { code: 'ru', name: 'Russian' },
  { code: 'pl', name: 'Polish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' },
  { code: 'el', name: 'Greek' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'en', name: 'English' },
  { code: 'other', name: 'Something else' },
] as const

export type RequestableLanguage = (typeof REQUESTABLE_LANGUAGES)[number]['code']

export function isRequestableLanguage(code: unknown): code is RequestableLanguage {
  return typeof code === 'string' && REQUESTABLE_LANGUAGES.some((l) => l.code === code) && !(LAUNCH_LANGUAGES as readonly string[]).includes(code)
}

export function requestableName(code: string): string {
  return REQUESTABLE_LANGUAGES.find((l) => l.code === code)?.name ?? code
}
