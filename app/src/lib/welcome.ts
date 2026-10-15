import type { GuideVoice } from '../player/types'

/**
 * The guide's welcome after a learner picks a language (board item PC-1013-01). The server voices it
 * once per language ahead of time (server/src/welcome.ts) and stores it publicly; the app only plays
 * it. Keep the version and path in step with the server.
 */
export const WELCOME_VERSION = 1

export interface Welcome {
  text: string
  parts: { url: string; durationSec: number }[]
}

export function welcomeUrl(supabaseUrl: string, target: string, nativeLanguage = 'en', guideId = 'mia'): string {
  return `${supabaseUrl}/storage/v1/object/public/guide-audio/welcome/v${WELCOME_VERSION}/${nativeLanguage}-${target}/${guideId}.json`
}

/** The welcome for a language, or undefined if it isn't voiced yet or can't be reached. Never throws. */
export async function loadWelcome(url: string, fetchImpl: typeof fetch = fetch): Promise<Welcome | undefined> {
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return undefined
    const m = (await res.json()) as Partial<Welcome>
    if (typeof m.text !== 'string' || !Array.isArray(m.parts) || m.parts.length === 0) return undefined
    if (!m.parts.every((p) => p && typeof p.url === 'string' && p.url.startsWith('https://'))) return undefined
    return { text: m.text, parts: m.parts }
  } catch {
    return undefined
  }
}

/** Plays the welcome's parts in order. Stops early once `stopped()` is true. Returns whether it reached the end. */
export async function playWelcome(voice: GuideVoice, welcome: Welcome, stopped: () => boolean): Promise<boolean> {
  for (const part of welcome.parts) {
    if (stopped()) return false
    await voice.play(part.url)
  }
  return !stopped()
}

/** The script for reading along: the guide's own words, with target-language words picked out. */
export function welcomeText(text: string): { text: string; target: boolean }[] {
  return text
    .split(/\[\[([^\[\]]+)\]\]/)
    .map((t, i) => ({ text: t, target: i % 2 === 1 }))
    .filter((p) => p.text.length > 0)
}
