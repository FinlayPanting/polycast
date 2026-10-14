import { normalizeToken } from './text'
import type { Word } from './types'

/**
 * Names in a show (title, hosts, recurring guests and places) for the transcriber's spelling
 * instruction, so subtitles and the tap-a-word glossary spell them right.
 */
export interface ShowNames {
  showTitle: string
  hosts: string[]
  names: string[]
}

/** ElevenLabs Scribe accepts an edit instruction of up to 2,000 characters. */
export const SCRIBE_INSTRUCTION_MAX = 2000

/**
 * The instruction Scribe applies after transcribing. It asks for spelling fixes to names only, so
 * the edited text stays word-for-word with the original and its timings still fit. Returns
 * undefined when there's nothing to tell it.
 */
export function scribeNameInstruction(show: ShowNames): string | undefined {
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
  const hosts = unique(show.hosts.map(clean).filter(Boolean))
  const title = clean(show.showTitle)
  const names = unique([...hosts, ...show.names.map(clean)].filter((n) => n && n.length <= 60))
  if (!title && names.length === 0) return undefined
  const intro =
    `This is an episode of the podcast "${title.slice(0, 200)}"` +
    (hosts.length ? `, hosted by ${hosts.slice(0, 6).join(', ')}.` : '.') +
    ' Correct only the spelling of names, so they match how they are written here'
  const outro =
    '. Change nothing else: do not rephrase, translate, add, remove, merge or split words, and leave punctuation as it is.'
  let list = ''
  for (const n of [title, ...names].filter(Boolean)) {
    const next = list ? `${list}, ${n}` : `: ${n}`
    if (intro.length + next.length + outro.length > SCRIBE_INSTRUCTION_MAX) break
    list = next
  }
  return intro + list + outro
}

/**
 * Capitalised words that recur across a show's episode titles (guests, places, regular segments),
 * skipping a title's first word, which is capitalised anyway. At most `max`, most frequent first.
 */
export function recurringNames(titles: string[], opts: { minTitles?: number; max?: number } = {}): string[] {
  const minTitles = opts.minTitles ?? 2
  const counts = new Map<string, number>()
  for (const title of titles) {
    const seen = new Set<string>()
    title.split(/\s+/).forEach((raw, i) => {
      const t = raw.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
      if (i === 0 || t.length < 3 || !/^\p{Lu}\p{Ll}/u.test(t)) return
      seen.add(t)
    })
    for (const t of seen) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minTitles)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, opts.max ?? 40)
    .map(([t]) => t)
}

/**
 * Takes spellings from Scribe's edited text while keeping every original word and its timing.
 * The two texts are walked side by side; where they differ, a word only takes the edited spelling
 * when the edit is a one-for-one swap of a similar-looking word (a name spelt differently).
 * Anything else (a word added, dropped, merged or rephrased) is ignored, and the original stays.
 */
export function applyEditedSpellings(words: Word[], editedText: string, language?: string): { words: Word[]; changed: number } {
  const edited = editedText.split(/\s+/).filter((t) => normalizeToken(t, language).length > 0)
  const a = words.map((w) => normalizeToken(w.text, language))
  const b = edited.map((t) => normalizeToken(t, language))
  const out = words.map((w) => ({ ...w }))
  const LOOKAHEAD = 6
  let i = 0
  let j = 0
  let changed = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    // Find where the two texts agree again: the nearest (di, dj) with a[i+di] === b[j+dj].
    let resync: [number, number] | undefined
    search: for (let d = 1; d <= LOOKAHEAD * 2; d++) {
      for (let di = Math.max(0, d - LOOKAHEAD); di <= Math.min(d, LOOKAHEAD); di++) {
        const dj = d - di
        if (i + di < a.length && j + dj < b.length && a[i + di] === b[j + dj] && (di > 0 || dj > 0)) {
          resync = [di, dj]
          break search
        }
      }
    }
    const [di, dj] = resync ?? [Math.min(a.length - i, b.length - j), Math.min(a.length - i, b.length - j)]
    if (di === dj) {
      for (let k = 0; k < di; k++) {
        if (looksLikeName(edited[j + k]!) && similar(a[i + k]!, b[j + k]!)) {
          out[i + k]!.text = withPunctuationOf(words[i + k]!.text, edited[j + k]!)
          changed++
        }
      }
    }
    i += di
    j += dj
  }
  return { words: out, changed }
}

/** Only names are re-spelt, and names start with a capital. */
function looksLikeName(token: string): boolean {
  return /^[\p{P}\p{S}]*\p{Lu}/u.test(token)
}

/** Two spellings of the same name: close in letters (Levenshtein within 30% of the longer). */
function similar(x: string, y: string): boolean {
  if (x === y) return false
  const longest = Math.max(x.length, y.length)
  return longest >= 3 && levenshtein(x, y) <= Math.max(1, Math.floor(longest * 0.3))
}

/** The edited word, wearing the original's leading and trailing punctuation. */
function withPunctuationOf(original: string, edited: string): string {
  const core = (s: string) => s.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
  const lead = original.match(/^[\p{P}\p{S}]*/u)![0]
  const trail = original.match(/[\p{P}\p{S}]*$/u)![0]
  return lead + core(edited) + trail
}

function levenshtein(x: string, y: string): number {
  let prev = Array.from({ length: y.length + 1 }, (_, k) => k)
  for (let p = 1; p <= x.length; p++) {
    const cur = [p]
    for (let q = 1; q <= y.length; q++) cur[q] = Math.min(prev[q]! + 1, cur[q - 1]! + 1, prev[q - 1]! + (x[p - 1] === y[q - 1] ? 0 : 1))
    prev = cur
  }
  return prev[y.length]!
}

function unique(xs: string[]): string[] {
  const seen = new Set<string>()
  return xs.filter((x) => (seen.has(x.toLowerCase()) ? false : (seen.add(x.toLowerCase()), true)))
}
