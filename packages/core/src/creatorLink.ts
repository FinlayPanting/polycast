import { LAUNCH_LANGUAGES } from './types'

/**
 * 'Learn with this show' links for hosts (PC-1030-07): on the creators page a host finds their show and gets
 * a polycast.app link plus one ready-to-paste show-notes line. The link's page opens the show in the app
 * (polycast://show?appleId=…), or points to the App Store when Polycast isn't installed. Listens through it
 * still stream from the host's own feed, so they count in the host's stats.
 */

export const SHOW_LINK_BASE = 'https://polycast.app/show'

const NAMES: Record<string, string> = { es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', sv: 'Swedish' }

/** Apple's show ids are digits; anything else gives no link. */
export function validAppleId(id: unknown): id is string {
  return typeof id === 'string' && /^\d{1,15}$/.test(id)
}

export function learnWithShowLink(appleId: string): string {
  if (!validAppleId(appleId)) throw new Error('Not an Apple show id')
  return `${SHOW_LINK_BASE}?apple=${appleId}`
}

/** Where the link's page sends someone who has the app: the show's page in Polycast. */
export function appShowUrl(appleId: string): string {
  if (!validAppleId(appleId)) throw new Error('Not an Apple show id')
  return `polycast://show?appleId=${appleId}`
}

/** The line a host pastes into their show notes once, for every episode. */
export function showNotesLine(language: string, link: string): string {
  const name = NAMES[language]
  return name ? `Learning ${name}? Hear this show with a guide on Polycast: ${link}` : `Learning a language? Hear this show with a guide on Polycast: ${link}`
}

export function isLaunchLanguage(language: unknown): language is (typeof LAUNCH_LANGUAGES)[number] {
  return typeof language === 'string' && (LAUNCH_LANGUAGES as readonly string[]).includes(language)
}
