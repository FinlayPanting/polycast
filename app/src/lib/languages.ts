import { flagsForLanguage, LAUNCH_LANGUAGES } from '@polycast/core'

export interface LanguageOption {
  code: string
  name: string
  /** How a learner describes the language in their own words, e.g. "Swedish". */
  native: string
  defaultFlag: string
}

const INFO: Record<string, { name: string; native: string }> = {
  es: { name: 'Spanish', native: 'Español' },
  fr: { name: 'French', native: 'Français' },
  de: { name: 'German', native: 'Deutsch' },
  it: { name: 'Italian', native: 'Italiano' },
  pt: { name: 'Portuguese', native: 'Português' },
  sv: { name: 'Swedish', native: 'Svenska' },
}

export const LANGUAGES: LanguageOption[] = LAUNCH_LANGUAGES.map((code) => ({
  code,
  ...INFO[code]!,
  defaultFlag: flagsForLanguage(code)[0]?.id ?? 'polycast',
}))

export function languageName(code: string | null | undefined): string {
  return (code && INFO[code]?.name) || 'your language'
}

export const GUIDANCE = [
  { id: 'light', title: 'Light', line: 'A short recap whenever the conversation moves on, and a wrap-up at the end.' },
  { id: 'standard', title: 'Standard', line: 'Adds a useful word or phrase every few minutes, in the host’s own voice, and the odd culture note.' },
  { id: 'handsOn', title: 'Hands-on', line: 'More words, more often, and quick questions that check you followed.' },
] as const

export const GUIDES = [
  { id: 'mia', name: 'Mia' },
  { id: 'leo', name: 'Leo' },
] as const

export function guideName(id: string | undefined): string {
  return GUIDES.find((g) => g.id === id)?.name ?? 'Mia'
}
