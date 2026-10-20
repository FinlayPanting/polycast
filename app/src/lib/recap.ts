import { BRAND, DEFAULT_MARK, FLAGS, POLE_COLOUR, type GlossEntry, type LessonPlan, type Segment } from '@polycast/core'
import { BARS } from './markGeometry'
import { CARD_COLOURS, wrapText, type CardText } from './shareCard'
import { SHARE_URL } from './shareLine'

/**
 * Share your lesson recap (PC-1019-F01): a 9:16 story card of what was learned (words picked up,
 * a "Did you know?" line, minutes, quiz score and podcasts completed), and a simpler "Word of the
 * episode" card on orange. Words only, never host audio. Laid out as plain numbers so it's tested;
 * `RecapCard` draws it with react-native-svg.
 */

export const STORY = { width: 1080, height: 1920, padding: 96 } as const

export interface RecapWord {
  word: string
  meaning: string
}

const MIN_WORDS = 3
const MAX_WORDS = 5

const key = (s: string) => s.trim().toLocaleLowerCase()

/**
 * 3 to 5 words picked up: saved this listen first, then the guide's spotlight terms, then the
 * primer's words. Each word once, each with a meaning. Fewer than 3 is fine; none hides the section.
 */
export function recapWords(plan: LessonPlan | null, savedThisListen: readonly string[], glossary?: Record<string, GlossEntry>): RecapWord[] {
  const meanings = new Map<string, RecapWord>()
  const note = (lemma: string, text: string, meaning: string) => {
    if (lemma && meaning && !meanings.has(key(lemma))) meanings.set(key(lemma), { word: text || lemma, meaning })
  }
  const spot = (plan?.moments ?? []).filter((m) => m.kind === 'spotlight' && m.term).map((m) => m.term!)
  const primer = plan?.primer?.words ?? []
  for (const t of [...spot, ...primer, ...(plan?.moments ?? []).flatMap((m) => (m.term ? [m.term] : []))]) note(t.lemma, t.text, t.meaning)
  for (const g of Object.values(glossary ?? {})) note(g.lemma, g.lemma, g.meaning)

  const out: RecapWord[] = []
  const seen = new Set<string>()
  const add = (lemma: string) => {
    const w = meanings.get(key(lemma))
    if (!w || seen.has(key(lemma)) || out.length >= MAX_WORDS) return
    seen.add(key(lemma))
    out.push(w)
  }
  for (const l of savedThisListen) add(l)
  for (const t of spot) add(t.lemma)
  for (const t of primer) add(t.lemma)
  return out
}

/** Whether the words section is worth showing at its intended size. */
export const enoughWords = (words: readonly RecapWord[]) => words.length >= MIN_WORDS

const MAX_DID_YOU_KNOW_WORDS = 25

/**
 * The card's "Did you know?" line: the one written for it while preparing, or, on older plans, the
 * first sentence of a culture note. Undefined when there's neither, so the section is left out.
 */
export function didYouKnow(plan: LessonPlan | null): string | undefined {
  const written = plan?.recap?.didYouKnow?.trim()
  const note = plan?.moments.find((m) => m.kind === 'cultureNote')?.script
  const raw = written || (note ? firstSentence(note.replace(/\{clip:\d+\}/g, '').replace(/\s+/g, ' ').trim()) : '')
  if (!raw) return undefined
  const words = raw.split(/\s+/)
  return words.length <= MAX_DID_YOU_KNOW_WORDS ? raw : `${words.slice(0, MAX_DID_YOU_KNOW_WORDS).join(' ').replace(/[,;:.]+$/, '')}…`
}

function firstSentence(text: string): string {
  const m = text.match(/^.+?[.!?](?=\s|$)/)
  return (m ? m[0] : text).trim()
}

/** The word of the episode: the first recap word, with the host's line it came from. */
export function wordOfTheEpisode(words: readonly RecapWord[], segments: readonly Segment[]): (RecapWord & { line?: string }) | undefined {
  const w = words[0]
  if (!w) return undefined
  const s = segments.find((seg) => key(seg.text).includes(key(w.word)) && seg.text.length <= 160)
  return { ...w, line: s?.text.trim() }
}

export interface RecapStats {
  minutes: number
  /** Quick-quiz score, if the learner answered any. */
  quiz?: { right: number; of: number }
  /** Podcasts finished overall, this one included. */
  completed?: number
}

export function statChips(s: RecapStats): string[] {
  const chips = [`${Math.max(1, Math.round(s.minutes))} min listened`]
  if (s.quiz && s.quiz.of > 0) chips.push(`Quiz ${s.quiz.right}/${s.quiz.of}`)
  if (s.completed && s.completed > 0) chips.push(s.completed === 1 ? '1 podcast completed' : `${s.completed} podcasts completed`)
  return chips
}

export interface RecapInput {
  languageName: string
  flagId?: string | null
  showTitle: string
  episodeTitle: string
  words: RecapWord[]
  didYouKnow?: string
  stats: RecapStats
}

export interface Chip {
  x: number
  y: number
  width: number
  height: number
  label: string
}

export interface StoryLayout {
  background: string
  mark: { x: number; y: number; width: number; height: number; radius: number; colour: string }[]
  texts: CardText[]
  /** A word and its meaning sit on one row: the word in orange. */
  wordRows: { y: number; word: string; meaning: string; size: number }[]
  chips: Chip[]
  /** Where the footer starts: nothing above may reach it. */
  footerTop: number
}

const CHAR_WIDTH = 0.53
const innerWidth = STORY.width - STORY.padding * 2
const charsPerLine = (size: number) => Math.floor(innerWidth / (size * CHAR_WIDTH))

function clamp(lines: string[], max: number): string[] {
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  kept[max - 1] = `${kept[max - 1]!.replace(/[\s.,;:!?…-]+$/, '')}…`
  return kept
}

function markAt(flagId: string | null | undefined, x: number, y: number, height: number, pole: string = POLE_COLOUR) {
  const flag = FLAGS.find((f) => f.id === flagId) ?? DEFAULT_MARK
  const scale = height / 105
  const colours = [pole, ...flag.bars]
  return BARS.map((b, i) => ({ x: x + b.x * scale, y: y + b.y * scale, width: 14 * scale, height: b.h * scale, radius: 7 * scale, colour: colours[i]! }))
}

function text(t: string, size: number, y: number, colour: string, weight: CardText['weight'], maxLines: number, lineHeight = Math.round(size * 1.25)): CardText {
  return { lines: clamp(wrapText(t, charsPerLine(size)), maxLines), size, lineHeight, y, colour, weight }
}

const after = (t: CardText, gap: number) => t.y + (t.lines.length - 1) * t.lineHeight + gap

const FOOTER = `Learn from real podcasts · ${SHARE_URL.replace(/^https?:\/\//, '')}`

/** The lesson recap story card, 1080 × 1920, on Polycast's navy. */
export function recapLayout(r: RecapInput): StoryLayout {
  const P = STORY.padding
  const footerTop = STORY.height - P - 60
  const texts: CardText[] = []
  const mark = markAt(r.flagId, P, P, 120)
  texts.push(text(`Learning ${r.languageName}`, 36, P + 190, CARD_COLOURS.quiet, 'semibold', 1))

  const intro = text('I just listened to', 40, P + 300, CARD_COLOURS.quiet, 'regular', 1)
  const show = text(r.showTitle, 64, after(intro, 84), CARD_COLOURS.text, 'semibold', 2)
  const episode = text(r.episodeTitle, 40, after(show, 62), CARD_COLOURS.quiet, 'regular', 2)
  texts.push(intro, show, episode)

  let y = after(episode, 120)
  const wordRows: StoryLayout['wordRows'] = []
  if (r.words.length) {
    const heading = text('Words I picked up', 36, y, CARD_COLOURS.accent, 'semibold', 1)
    texts.push(heading)
    y = after(heading, 76)
    for (const w of r.words) {
      const maxMeaning = Math.max(8, charsPerLine(44) - w.word.length - 3)
      const meaning = w.meaning.length > maxMeaning ? `${w.meaning.slice(0, maxMeaning - 1).trimEnd()}…` : w.meaning
      wordRows.push({ y, word: w.word, meaning, size: 44 })
      y += 72
    }
    y += 40
  }

  if (r.didYouKnow) {
    const heading = text('Did you know?', 36, y, CARD_COLOURS.accent, 'semibold', 1)
    const body = text(r.didYouKnow, 40, after(heading, 64), CARD_COLOURS.text, 'regular', 4, 54)
    texts.push(heading, body)
    y = after(body, 100)
  }

  // Chips sit just above the footer, wrapping onto a second row if needed.
  const labels = statChips(r.stats)
  const chipH = 72
  const chipSize = 30
  const widths = labels.map((l) => Math.round(l.length * chipSize * CHAR_WIDTH + 56))
  const rows: { label: string; width: number }[][] = [[]]
  let rowW = 0
  labels.forEach((label, i) => {
    const w = widths[i]!
    if (rowW && rowW + 20 + w > innerWidth) {
      rows.push([])
      rowW = 0
    }
    rows.at(-1)!.push({ label, width: w })
    rowW += (rowW ? 20 : 0) + w
  })
  const chipsTop = Math.max(y, footerTop - 60 - rows.length * (chipH + 20))
  const chips: Chip[] = []
  rows.forEach((row, ri) => {
    let x = P
    for (const c of row) {
      chips.push({ x, y: chipsTop + ri * (chipH + 20), width: c.width, height: chipH, label: c.label })
      x += c.width + 20
    }
  })

  texts.push({ lines: [FOOTER], size: 32, lineHeight: 42, y: STORY.height - P, colour: CARD_COLOURS.accent, weight: 'semibold' })
  return { background: BRAND.navy, mark, texts, wordRows, chips, footerTop }
}

/** The "Word of the episode" story card, on orange: one word, its meaning, the host's line, the show. */
export function wordCardLayout(w: RecapWord & { line?: string }, showTitle: string, flagId?: string | null): StoryLayout {
  const P = STORY.padding
  const ink = BRAND.navy
  const texts: CardText[] = []
  const heading = text('Word of the episode', 40, P + 260, ink, 'semibold', 1)
  const wordSize = w.word.length <= 10 ? 150 : w.word.length <= 16 ? 110 : 80
  const word = text(w.word, wordSize, after(heading, Math.round(wordSize * 1.1)), ink, 'semibold', 2, Math.round(wordSize * 1.1))
  const meaning = text(w.meaning, 52, after(word, 100), ink, 'regular', 3, 66)
  texts.push(heading, word, meaning)
  if (w.line) texts.push(text(`“${w.line}”`, 40, after(meaning, 130), ink, 'regular', 5, 54))
  const footerTop = STORY.height - P - 60
  texts.push(text(`From ${showTitle}`, 34, footerTop - 20, ink, 'regular', 1))
  texts.push({ lines: [FOOTER], size: 32, lineHeight: 42, y: STORY.height - P, colour: ink, weight: 'semibold' })
  return { background: BRAND.orange, mark: markAt(flagId, P, P, 120, BRAND.navy), texts, wordRows: [], chips: [], footerTop }
}

/** The words that travel with either card. */
export function recapMessage(showTitle: string, episodeTitle: string): string {
  return `I just listened to ${episodeTitle} from ${showTitle} on Polycast.\n${SHARE_URL}`
}
