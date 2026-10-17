/**
 * The guide's goodbye in the language being learnt (board item PC-1015-09). The server voices it
 * once per language and guide ahead of time (server/src/goodbye.ts) and stores it publicly; the app
 * only plays it, after the wrap-up. Keep the version and path in step with the server.
 */
export const GOODBYE_VERSION = 1

export interface Goodbye {
  text: string
  meaning: string
  url: string
}

export function goodbyeUrl(supabaseUrl: string, target: string, guideId = 'mia'): string {
  return `${supabaseUrl}/storage/v1/object/public/guide-audio/goodbye/v${GOODBYE_VERSION}/${target}/${guideId}.json`
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
