/**
 * What the list already knows about a show, carried to its page so the artwork and title show at
 * once while the episodes load (PC-1017-F03). Plain strings, as screen parameters must be.
 */
export function showPeek(s: { title?: string | null; artwork?: string | null; author?: string | null }): Record<string, string> {
  const out: Record<string, string> = {}
  if (s.title) out.title = s.title
  if (s.artwork) out.artwork = s.artwork
  if (s.author) out.author = s.author
  return out
}
