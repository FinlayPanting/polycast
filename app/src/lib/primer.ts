import { primerPath, type Clip, type Primer } from '@polycast/core'

/**
 * Where the Episode Primer on the episode screen comes from, and what its word clips play from
 * (PC-1017-P2, P4). A lesson saved on the phone wins: its primer is lined up with the learner's own
 * copy, so the host's clips play the right moment, offline too. Otherwise the server's primer shows;
 * on an iPhone its clips are timed on Polycast's copy, which can have different adverts from the
 * learner's stream, so they only play once the episode is saved (it saves itself on the first listen).
 * Elsewhere (the web preview) clips stream.
 */
export function primerSource(
  saved: { primer?: Primer; audioUrl: string } | undefined,
  fetched: Primer | null | undefined,
  streamUrl: string | null | undefined,
  linesUpOnDevice: boolean,
): { primer: Primer; audioUrl?: string } | undefined {
  if (saved?.primer) return { primer: saved.primer, audioUrl: saved.audioUrl }
  if (!fetched) return undefined
  return { primer: fetched, audioUrl: linesUpOnDevice || !streamUrl ? undefined : streamUrl }
}

/** A clip that exists in the copy it's timed on (one only in Polycast's copy is marked -1). */
export function playableClip(clip: Clip | undefined): clip is Clip {
  return Boolean(clip && clip.start >= 0 && clip.end > clip.start)
}

/** "0:42", "12:05": when something comes up, for the themes and words. */
export function clockTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Where the server publishes an episode's primer while it's being prepared (PC-1017-P3). */
export function earlyPrimerUrl(supabaseUrl: string, episodeId: string): string {
  return `${supabaseUrl}/storage/v1/object/public/guide-audio/${primerPath(episodeId)}`
}

/** Checks a primer read from the network has the shape the screen needs. */
export function asPrimer(x: unknown): Primer | undefined {
  const p = x as Partial<Primer> | null
  if (!p || typeof p.gist !== 'string' || !Array.isArray(p.words) || !Array.isArray(p.themes)) return undefined
  const words = p.words.filter((w) => w && typeof w.text === 'string' && typeof w.meaning === 'string' && typeof w.at === 'number')
  const themes = p.themes.filter((t) => t && typeof t.title === 'string' && typeof t.at === 'number')
  return { gist: p.gist, gistNative: typeof p.gistNative === 'string' ? p.gistNative : '', words, themes }
}

/** The primer published while preparing, or undefined while it isn't written yet. Never throws. */
export async function loadEarlyPrimer(url: string, fetchImpl: typeof fetch = fetch): Promise<Primer | undefined> {
  try {
    const res = await fetchImpl(url, { cache: 'no-store' })
    return res.ok ? asPrimer(await res.json()) : undefined
  } catch {
    return undefined
  }
}

/**
 * The stages a primer appears in on the prepare screen, gist first, then each word, then the themes
 * (PC-1017-P3). Nothing is shown before the primer really exists.
 */
export function primerReveal(primer: Primer | undefined): ('gist' | `word:${number}` | 'themes')[] {
  if (!primer) return []
  return ['gist', ...primer.words.map((_, i) => `word:${i}` as const), ...(primer.themes.length ? (['themes'] as const) : [])]
}

export interface MapPlace {
  title: string
  at: number
  /** Share of the way through the episode, 0 to 1. */
  frac: number
}

/**
 * The episode map (PC-1017-P5): the sections where the conversation moves on, and where each theme
 * first comes up, placed along the episode. Without sections (older primers) the themes carry it.
 */
export function episodeMap(primer: Primer, durationSec: number): { sections: (MapPlace & { endFrac: number })[]; themes: MapPlace[] } {
  const d = Math.max(1, durationSec)
  const frac = (t: number) => Math.min(1, Math.max(0, t / d))
  const sections = (primer.sections ?? []).map((s, i, all) => ({ title: s.title, at: s.at, frac: frac(s.at), endFrac: frac(all[i + 1]?.at ?? d) }))
  return { sections, themes: primer.themes.map((t) => ({ title: t.title, at: t.at, frac: frac(t.at) })) }
}

/** Where a jump from the map starts playing: a few seconds early, so the learner hears the lead-in. */
export function jumpStart(at: number): number {
  return Math.max(0, Math.floor(at - 3))
}
