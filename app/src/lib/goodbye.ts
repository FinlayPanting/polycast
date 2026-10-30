import { NIGHT_OWL } from '@polycast/core'

/**
 * The guide's goodbye in the language being learnt (board item PC-1015-09). The server voices it
 * once per language and guide ahead of time (server/src/goodbye.ts) and stores it publicly; the app
 * only plays it, after the wrap-up. Keep the version and path in step with the server.
 */
export const GOODBYE_VERSION = 2

export interface Goodbye {
  text: string
  meaning: string
  url: string
}

export function goodbyeUrl(supabaseUrl: string, target: string, guideId = 'mia', night = false): string {
  return `${supabaseUrl}/storage/v1/object/public/guide-audio/goodbye/v${GOODBYE_VERSION}/${target}/${guideId}${night ? '-night' : ''}.json`
}

/** Night owl (PC-1025-06): from 11 pm until 4 am on the phone's clock, the goodbye becomes a goodnight. */
export function isNightOwl(now: Date): boolean {
  const h = now.getHours()
  return h >= NIGHT_OWL.fromHour || h < NIGHT_OWL.untilHour
}

/** The sign-off for the moment it plays: the goodnight late at night if it's voiced, otherwise the goodbye. */
export function pickFarewell(farewells: { goodbye?: Goodbye; goodnight?: Goodbye }, now: Date): Goodbye | undefined {
  return (isNightOwl(now) && farewells.goodnight) || farewells.goodbye
}

/** The goodbye for a language and guide, or undefined if it isn't voiced yet or can't be reached. Never throws. */
export async function loadGoodbye(url: string, fetchImpl: typeof fetch = fetch): Promise<Goodbye | undefined> {
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return undefined
    const m = (await res.json()) as Partial<Goodbye>
    if (typeof m.text !== 'string' || typeof m.meaning !== 'string' || typeof m.url !== 'string' || !m.url.startsWith('https://')) return undefined
    return { text: m.text, meaning: m.meaning, url: m.url }
  } catch {
    return undefined
  }
}
