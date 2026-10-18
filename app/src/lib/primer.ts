import type { Clip, Primer } from '@polycast/core'

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
