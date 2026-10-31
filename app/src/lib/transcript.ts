import { normalizeToken, segmentAt, type GlossEntry, type Segment, type Word } from '@polycast/core'

/**
 * Read the whole episode (PC-1030-03): every line in the host's language with its translation underneath,
 * the line being spoken picked out, words the learner has saved underlined, and any line a tap away. Pure, so
 * it is tested here; the sheet in components/TranscriptSheet.tsx draws it.
 */

export interface TranscriptPiece {
  text: string
  /** Index into the transcript's words. */
  index: number
  /** A word the learner has saved (by its dictionary form). */
  saved: boolean
}

export interface TranscriptLine {
  id: string
  start: number
  text: string
  translation?: string
  pieces: TranscriptPiece[]
  /** Read aloud by VoiceOver: when, the line, and the translation. */
  label: string
}

/** Minutes and seconds for the line's time stamp: 0:07, 12:45, 1:02:03. */
export function stamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** The lemma a word is saved under: the glossary's dictionary form, or the word itself. */
function lemmaOf(w: Word, glossary: Record<string, GlossEntry> | undefined, language?: string): string {
  const form = normalizeToken(w.text, language)
  return glossary?.[form]?.lemma ?? form
}

export function transcriptLines(
  segments: Segment[],
  words: Word[],
  opts: { saved?: string[]; glossary?: Record<string, GlossEntry>; language?: string; withTranslation?: boolean } = {},
): TranscriptLine[] {
  const saved = new Set((opts.saved ?? []).map((s) => normalizeToken(s, opts.language)))
  return segments.map((seg) => {
    const pieces = words.slice(seg.wordStart, seg.wordEnd).map((w, k) => ({
      text: w.text,
      index: seg.wordStart + k,
      saved: saved.size > 0 && saved.has(normalizeToken(lemmaOf(w, opts.glossary, opts.language), opts.language)),
    }))
    const translation = opts.withTranslation === false ? undefined : seg.translation || undefined
    return {
      id: seg.id,
      start: seg.start,
      text: seg.text,
      translation,
      pieces,
      label: `${stamp(seg.start)}. ${seg.text}${translation ? `. ${translation}` : ''}`,
    }
  })
}

/**
 * The line to pick out at `position`: the one being spoken, or in a pause the one just heard, so the highlight
 * never jumps back to the top. -1 before the first line.
 */
export function currentLine(segments: Segment[], position: number): number {
  const i = segmentAt(segments, position)
  if (i >= 0) return i
  let lo = 0
  let hi = segments.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid]!.start <= position) (best = mid), (lo = mid + 1)
    else hi = mid - 1
  }
  return best
}

/** The sheet's heading and the line under it. */
export const TRANSCRIPT_TITLE = 'Transcript'
export const TRANSCRIPT_HINT = 'Tap a line to listen from there.'
export const TRANSCRIPT_EMPTY = 'This episode has no transcript yet.'
