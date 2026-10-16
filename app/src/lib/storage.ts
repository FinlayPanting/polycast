/**
 * Pure rules for the downloads folder (Documents/episodes): which episodes are stale, and how much
 * space it all takes. Kept free of file-system calls so they can be tested.
 */

/** Downloads untouched for this long are tidied away, unless a saved word needs their clip. */
export const TIDY_AFTER_DAYS = 30

export interface FolderEntry {
  name: string
  size: number
  modifiedMs?: number
}

/** The episode an entry in the folder belongs to: "<uuid>.mp3", "<uuid>-guide", "<uuid>.lesson.json"… */
export function episodeOf(name: string): string | undefined {
  return name.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1]
}

/** Episodes whose files were all last touched over TIDY_AFTER_DAYS ago, minus those to keep. */
export function staleEpisodes(entries: FolderEntry[], keep: Set<string>, nowMs: number, days = TIDY_AFTER_DAYS): string[] {
  const lastUsed = new Map<string, number>()
  for (const e of entries) {
    const id = episodeOf(e.name)
    if (!id) continue
    // An entry without a time counts as just used, so nothing is removed on a guess.
    lastUsed.set(id, Math.max(lastUsed.get(id) ?? 0, e.modifiedMs ?? nowMs))
  }
  const cutoff = nowMs - days * 86_400_000
  return [...lastUsed].filter(([id, t]) => t < cutoff && !keep.has(id)).map(([id]) => id).sort()
}

export function totalSize(entries: FolderEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.size || 0), 0)
}

/** "230 MB", "1.4 GB", "Nothing yet". */
export function formatSize(bytes: number): string {
  if (bytes < 1_000_000) return bytes > 0 ? 'Under 1 MB' : 'Nothing yet'
  if (bytes < 1_000_000_000) return `${Math.round(bytes / 1_000_000)} MB`
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`
}

/** Shown in review when a word's episode copy has left the phone. */
export const CLIP_GONE = 'Its episode is no longer on this phone, so the host’s clip can’t play. Download the episode again to hear it.'
