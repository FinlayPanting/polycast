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

/** Guide intensity (PC-1017-F13), chosen per episode; the last choice becomes the default. */
export const GUIDANCE = [
  { id: 'handsOn', title: 'Hands-on', line: 'About once a minute: words in the host’s own voice, quick questions and recaps.' },
  { id: 'standard', title: 'Standard', line: 'About every 3 minutes: the most useful words and the odd culture note.' },
  { id: 'light', title: 'Light', line: 'About every 5 minutes: a few key words and a recap when the conversation moves on.' },
] as const

export const GUIDES = [
  { id: 'mia', name: 'Mia' },
  { id: 'leo', name: 'Leo' },
] as const

export function guideName(id: string | undefined): string {
  return GUIDES.find((g) => g.id === id)?.name ?? 'Mia'
}

/**
 * The guide an episode will actually be heard in (PC-1017-F01): the voice its lesson was recorded
 * in, when known, rather than the learner's current setting. Switching to Leo doesn't make Mia's
 * recorded lines say "Leo".
 */
export function voicedGuideId(recordedWith: string | null | undefined, chosen: string | undefined): string {
  return GUIDES.find((g) => g.id === recordedWith)?.id ?? GUIDES.find((g) => g.id === chosen)?.id ?? 'mia'
}

export type GuidanceLevelId = (typeof GUIDANCE)[number]['id']

/** A guidance level from a screen parameter, or the fallback when it isn't one. */
export function guidanceLevelOr(value: string | undefined | null, fallback: GuidanceLevelId): GuidanceLevelId {
  return GUIDANCE.find((g) => g.id === value)?.id ?? fallback
}
