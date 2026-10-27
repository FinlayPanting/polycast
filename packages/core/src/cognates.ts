import { findOccurrences, wordClip } from './clips'
import type { Clip, GlossEntry, Word } from './types'

/**
 * "You already know these words" (PC-1022-08): words in an episode that look and sound like their
 * meaning in the learner's language (Italian "importante", Swedish "musik"), picked from the
 * episode's own tap-a-word glossary, each with the host saying it. No AI is used.
 */
export interface KnownWord {
  /** As the host says it. */
  text: string
  /** Its meaning in the learner's language, from the glossary. */
  meaning: string
  /** The host saying it, cut from the episode audio. */
  clip: Clip
}

export const KNOWN_WORDS_COUNT = 5
/** Below this, a word and its meaning are too far apart to feel already known. */
export const COGNATE_MIN_SIMILARITY = 0.7
const MIN_LETTERS = 4

/** Lowercase letters only, accents dropped: "Café" → "cafe". */
function plain(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}]/gu, '')
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return row[b.length]!
}

/** The headword of a glossary meaning: "music; songs" → "music", "to celebrate" → "celebrate". */
function headword(meaning: string): string {
  const first = meaning.split(/[;,/(]/)[0]!.trim().toLowerCase()
  return first.replace(/^(to|the|a|an)\s+/, '').trim()
}

/** How alike a word and its meaning look, 0 to 1. Single words only. */
export function cognateSimilarity(word: string, meaning: string): number {
  const head = headword(meaning)
  if (/\s/.test(head)) return 0
  const a = plain(word)
  const b = plain(head)
  if (a.length < MIN_LETTERS || b.length < MIN_LETTERS) return 0
  // Endings differ most ("famiglia" / "family", "musica" / "music"), so a final vowel is also tried without.
  const trim = (w: string) => (w.length > MIN_LETTERS && /[aeiouy]$/.test(w) ? w.slice(0, -1) : w)
  let best = 0
  for (const x of new Set([a, trim(a)]))
    for (const y of new Set([b, trim(b)])) best = Math.max(best, 1 - levenshtein(x, y) / Math.max(x.length, y.length))
  return best
}

/**
 * Up to five words from the episode that the learner already knows, the most alike first and
 * each word once (by dictionary form), with the clip of the first time the host says it.
 */
export function knownWords(words: Word[], glossary: Record<string, GlossEntry> | undefined, language?: string, count = KNOWN_WORDS_COUNT): KnownWord[] {
  if (!glossary) return []
  const seen = new Set<string>()
  const found: (KnownWord & { score: number; at: number })[] = []
  for (const [form, entry] of Object.entries(glossary)) {
    const score = Math.max(cognateSimilarity(form, entry.meaning), cognateSimilarity(entry.lemma, entry.meaning))
    if (score < COGNATE_MIN_SIMILARITY) continue
    const lemma = plain(entry.lemma)
    if (seen.has(lemma)) continue
    const occ = findOccurrences(words, form, language)[0]
    if (!occ) continue
    seen.add(lemma)
    found.push({ text: words.slice(occ.first, occ.last + 1).map((w) => w.text.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')).join(' '), meaning: headword(entry.meaning), clip: wordClip(words, occ), score, at: occ.start })
  }
  return found
    .sort((x, y) => y.score - x.score || y.text.length - x.text.length || x.at - y.at)
    .slice(0, count)
    .map(({ text, meaning, clip }) => ({ text, meaning, clip }))
}
