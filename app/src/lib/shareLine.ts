import type { Segment } from '@polycast/core'

/** Where a shared line points. polycast.app forwards to the App Store page once the app is live. */
export const SHARE_URL = 'https://polycast.app'

export interface ShareableLine {
  text: string
  translation: string
  start: number
}

const MIN_CHARS = 12
const MAX_CHARS = 160

/**
 * Lines worth sharing from this listen: the host's lines around words the learner caught (saved, or
 * taught by the guide), in episode order, at most `limit`. A line needs a translation and a length
 * that fits a card: not a fragment, not a paragraph.
 */
export function shareableLines(segments: Segment[], caughtAt: number[], limit = 3): ShareableLine[] {
  const picked = new Map<string, ShareableLine>()
  for (const t of [...caughtAt].sort((a, b) => a - b)) {
    const s = segments.find((seg) => seg.start <= t + 0.05 && seg.end >= t - 0.05)
    if (!s || picked.has(s.id)) continue
    const text = s.text.trim()
    const translation = s.translation?.trim()
    if (!translation || text.length < MIN_CHARS || text.length > MAX_CHARS) continue
    picked.set(s.id, { text, translation, start: s.start })
    if (picked.size >= limit) break
  }
  return [...picked.values()]
}

/** The words that travel with the card: the line, its meaning, and credit to the show. */
export function shareMessage(line: ShareableLine, showTitle: string): string {
  return `“${line.text}”\n${line.translation}\n\nCaught on Polycast, from ${showTitle}.\n${SHARE_URL}`
}
