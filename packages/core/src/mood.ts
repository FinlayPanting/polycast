import { stripSponsorReads } from './showText'
/**
 * "Tell Mia what you're in the mood for" (board item PC-1016-07): a learner types a mood, or taps a
 * chip, and gets three shows or prepared episodes in their language with a line on why each fits.
 * The pure parts live here: tidying the mood, the keyword pre-filter that keeps the AI call small,
 * the prompt, and checking the reply. The server does the one Gemini call (server/src/mood.ts).
 */

export const MOOD_MAX_CHARS = 100
/** Candidates sent to the model after the keyword pre-filter. */
export const MOOD_CANDIDATES = 40
export const MOOD_PICKS = 3
export const MOOD_WHY_MAX_CHARS = 140

/** Tappable moods for learners who don't know what to type. */
export const MOOD_CHIPS = [
  'Something funny',
  'A calm story for the train',
  'Food and cooking',
  'True crime',
  'Learn something new',
  'Easy chat between friends',
] as const

export interface MoodCandidate {
  /** Unique within one request: `show:<key>` or `episode:<id>`. */
  id: string
  kind: 'show' | 'episode'
  title: string
  author?: string
  description?: string
  /** Genres, categories, or an episode's topics. */
  tags: string[]
  /** For episodes: the show it's from. */
  podcastTitle?: string
}

export interface MoodPick {
  id: string
  why: string
}

/** Trims, collapses spaces and caps a typed mood. Empty means there's nothing to ask. */
export function normaliseMood(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MOOD_MAX_CHARS)
}

const STOPWORDS = new Set(
  'a an and the something some for about with without of to in on at from by or but that this into me my i im i\'m want would like feel feeling mood kind sort bit little really very just more less please show shows podcast podcasts episode episodes listen listening'.split(' '),
)

function words(text: string): string[] {
  return (text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/\p{L}+/gu) ?? []).filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

/** The cache key for a mood: the same words in any order or case ask the same thing. */
export function moodKey(language: string, mood: string): string {
  return `${language}:${[...new Set(words(mood))].sort().join(' ')}`
}

/**
 * Keeps the AI call small: candidates sharing words with the mood come first (most shared first),
 * the rest follow in the pool's own order (Polycast picks, then the charts), up to `max`. Titles and
 * descriptions are mostly in the target language and moods in English, so the fill matters.
 */
export function prefilterCandidates(mood: string, pool: MoodCandidate[], max = MOOD_CANDIDATES): MoodCandidate[] {
  const wanted = new Set(words(mood))
  const scored = pool.map((c, i) => {
    const have = new Set(words([c.title, c.author ?? '', c.description ?? '', c.tags.join(' '), c.podcastTitle ?? ''].join(' ')))
    let score = 0
    for (const w of wanted) if (have.has(w) || [...have].some((h) => h.length >= 5 && w.length >= 5 && (h.startsWith(w) || w.startsWith(h)))) score++
    return { c, i, score }
  })
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.slice(0, max).map((s) => s.c)
}

/** Strips HTML, links, sponsor reads and extra spaces from a feed description and caps its length. */
export function cleanDescription(html: string | undefined | null, max = 1000): string | undefined {
  if (!html) return undefined
  // Feeds often escape their HTML (&lt;p&gt;), so unescape the brackets before removing tags.
  const text = html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Sponsor reads and hosting notices aren't what the show is about (PC-1017-T1).
  const clean = stripSponsorReads(text)
  if (!clean) return undefined
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

const LANGUAGE_NAMES: Record<string, string> = { es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', sv: 'Swedish', en: 'English' }

export const MOOD_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'why'] },
    },
  },
  required: ['picks'],
} as const

/** The one small call: the mood and the shortlisted candidates in, three ids with a reason out. */
export function moodPrompt(mood: string, candidates: MoodCandidate[], language: string, nativeLanguage = 'en'): { system: string; prompt: string; schema: Record<string, unknown> } {
  const target = LANGUAGE_NAMES[language] ?? language
  const native = LANGUAGE_NAMES[nativeLanguage] ?? nativeLanguage
  const system = [
    `You are Mia, a warm language guide in Polycast, an app for learning ${target} from real podcasts.`,
    `A learner tells you what they're in the mood for. Choose the ${MOOD_PICKS} best matches from the list, only from the list, preferring variety.`,
    `For each, write one short line in ${native} (British spelling, under 20 words) on why it fits their mood. Plain and friendly, like a friend's tip; no exclamation marks, no hype, don't repeat the title.`,
  ].join(' ')
  const lines = candidates.map((c) => {
    const parts = [`${c.id} | ${c.kind === 'episode' ? `episode of ${c.podcastTitle ?? 'a show'}: ` : ''}${c.title}`]
    if (c.author) parts.push(`by ${c.author}`)
    if (c.tags.length) parts.push(c.tags.slice(0, 5).join(', '))
    if (c.description) parts.push(c.description.slice(0, 300))
    return parts.join(' | ')
  })
  return { system, prompt: `Mood: ${mood}\n\nCandidates (id | title | by | tags | description):\n${lines.join('\n')}`, schema: MOOD_SCHEMA as unknown as Record<string, unknown> }
}

/** Keeps only picks that name a real candidate, once each, with a tidy reason; at most three. */
export function checkMoodPicks(reply: unknown, candidates: MoodCandidate[]): MoodPick[] {
  const ids = new Set(candidates.map((c) => c.id))
  const out: MoodPick[] = []
  const picks = (reply as { picks?: unknown })?.picks
  if (!Array.isArray(picks)) return out
  for (const p of picks) {
    const id = typeof p?.id === 'string' ? p.id.trim() : ''
    const why = typeof p?.why === 'string' ? p.why.replace(/\s+/g, ' ').replace(/!+/g, '.').trim() : ''
    if (!ids.has(id) || out.some((o) => o.id === id) || !why) continue
    out.push({ id, why: why.length > MOOD_WHY_MAX_CHARS ? `${why.slice(0, MOOD_WHY_MAX_CHARS - 1).trimEnd()}…` : why })
    if (out.length === MOOD_PICKS) break
  }
  return out
}

/** The channel description from the start of a feed, before the first episode. */
export function feedDescriptionFromHead(head: string): string | undefined {
  const channel = head.split(/<item[\s>]/i)[0] ?? head
  const m =
    channel.match(/<itunes:summary[^>]*>([\s\S]*?)<\/itunes:summary>/i) ??
    channel.match(/<description[^>]*>([\s\S]*?)<\/description>/i)
  if (!m) return undefined
  return cleanDescription(m[1]!.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, ''))
}
