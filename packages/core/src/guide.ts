import type { GuideMoment, GuidanceLevel, MomentKind } from './types'

export const LEVELS: readonly GuidanceLevel[] = ['light', 'standard', 'handsOn']

/** Does a learner on `level` hear a moment whose lightest level is `minLevel`? */
export function includes(level: GuidanceLevel, minLevel: GuidanceLevel): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(minLevel)
}

/**
 * The lightest level each kind of moment belongs to (spec: Tutor mode, "A listen, start to finish").
 * Word moments, culture notes and questions are ranked: their level is decided in `assignMomentLevels`,
 * never lighter than this.
 */
export const KIND_MIN_LEVEL: Record<MomentKind, GuidanceLevel> = {
  listenFor: 'light',
  spotlight: 'light',
  warmup: 'light',
  checkpoint: 'light',
  wrapUp: 'light',
  cultureNote: 'standard',
  quickQuestion: 'handsOn',
}

/**
 * How often the guide steps in at each level (PC-1017-F13, F14): Hands-on about once a minute,
 * Standard about every 3 minutes, Light about every 5. Every episode is planned once at Hands-on
 * density; these are the minimum gaps between guide stops that each level keeps, so moments are
 * spread out rather than clustered. Picking the best-ranked moments with these gaps lands, on a
 * typical episode, between one and two gaps apart: about the targets in LEVEL_MINUTES. A natural
 * pause always wins over exact timing.
 */
export const GUIDE_SPACING: Record<GuidanceLevel, number> = {
  light: 180,
  standard: 100,
  handsOn: 40,
}

/** What each level feels like, roughly: one guide stop every this many minutes. */
export const LEVEL_MINUTES: Record<GuidanceLevel, number> = { light: 5, standard: 3, handsOn: 1 }

/**
 * A guide stop that can be ranked: a word moment (its listen-for and spotlight, from `start` to
 * `end`), a culture note or a quick question. `floor` is the lightest level it may be played at.
 */
export interface RankedUnit {
  id: string
  start: number
  end: number
  /** Higher is more useful. */
  priority: number
  floor: GuidanceLevel
}

const heavier = (a: GuidanceLevel, b: GuidanceLevel): GuidanceLevel => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b)

const distance = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  Math.max(0, a.start - b.end, b.start - a.end)

/**
 * The ranked approach (PC-1017-F13): decides the lightest level that hears each unit, or undefined
 * when even Hands-on can't fit it. Light takes the best-ranked units that keep its gap from each
 * other and from the fixed moments (warm-up, recaps, wrap-up, at `fixed` times); Standard adds the
 * next best keeping its gap; Hands-on adds the rest that keep its gap. Levels nest: a learner on
 * a level hears everything lighter too.
 */
export function assignMomentLevels(
  units: RankedUnit[],
  fixed: number[] = [],
  spacing: Record<GuidanceLevel, number> = GUIDE_SPACING,
): Map<string, GuidanceLevel | undefined> {
  const ranked = [...units].sort((a, b) => b.priority - a.priority || a.start - b.start)
  const result = new Map<string, GuidanceLevel | undefined>()
  const chosen: { start: number; end: number; level: GuidanceLevel }[] = fixed.map((t) => ({ start: t, end: t, level: 'light' }))
  for (const level of LEVELS) {
    for (const u of ranked) {
      if (result.has(u.id) || !includes(level, u.floor)) continue
      // Two stops are heard together from the heavier of their two levels, so that level's gap applies.
      const clear = chosen.every((c) => distance(u, c) >= spacing[heavier(level, c.level)])
      if (clear) {
        chosen.push({ start: u.start, end: u.end, level })
        result.set(u.id, level)
      }
    }
  }
  for (const u of units) if (!result.has(u.id)) result.set(u.id, undefined)
  return result
}

/**
 * Order of moments that share a break: look back first (recap, spotlight, culture note, question),
 * then look ahead (listen-for).
 */
const ORDER_AT_BREAK: Record<MomentKind, number> = {
  warmup: 0,
  checkpoint: 1,
  spotlight: 2,
  cultureNote: 3,
  quickQuestion: 4,
  listenFor: 5,
  wrapUp: 6,
}

export interface SelectOptions {
  /** Light has the warm-up off by default; any level can skip it. */
  warmup?: boolean
}

/** The moments a learner hears at their guidance level, in the order they play. */
export function selectMoments(moments: GuideMoment[], level: GuidanceLevel, opts: SelectOptions = {}): GuideMoment[] {
  const warmup = opts.warmup ?? level !== 'light'
  return moments
    .filter((m) => includes(level, m.minLevel))
    .filter((m) => warmup || m.kind !== 'warmup')
    .sort((a, b) => a.at - b.at || ORDER_AT_BREAK[a.kind] - ORDER_AT_BREAK[b.kind])
}

/** Total seconds of guide speech a level adds, once audio exists. */
export function guideSeconds(moments: GuideMoment[]): number {
  return moments.reduce((sum, m) => sum + (m.audio?.durationSec ?? 0), 0)
}

export interface PlanProblem {
  momentId: string
  problem: string
}

/** Checks a lesson plan against the spec's rules before it is saved. */
export function validateMoments(moments: GuideMoment[], durationSec: number): PlanProblem[] {
  const problems: PlanProblem[] = []
  const byTerm = new Map<string, GuideMoment[]>()
  for (const m of moments) {
    if (m.at < 0 || m.at > durationSec) problems.push({ momentId: m.id, problem: 'outside the episode' })
    if (m.kind === 'quickQuestion') {
      const q = m.question
      if (!q || q.options.length < 2 || q.answerIndex < 0 || q.answerIndex >= q.options.length) {
        problems.push({ momentId: m.id, problem: 'question needs 2+ options and a valid answer' })
      }
    }
    const clipRefs = [...m.script.matchAll(/\{clip:(\d+)\}/g)].map((r) => Number(r[1]))
    for (const n of clipRefs) {
      if (!m.clips[n]) problems.push({ momentId: m.id, problem: `script refers to missing clip ${n}` })
    }
    if (m.kind === 'listenFor' || m.kind === 'spotlight') {
      if (!m.termId || !m.term) problems.push({ momentId: m.id, problem: 'word moment needs a term' })
      else byTerm.set(m.termId, [...(byTerm.get(m.termId) ?? []), m])
    }
  }
  for (const [termId, pair] of byTerm) {
    const listen = pair.find((m) => m.kind === 'listenFor')
    const spot = pair.find((m) => m.kind === 'spotlight')
    if (!listen || !spot) problems.push({ momentId: termId, problem: 'word moment needs both listen-for and spotlight' })
    else if (listen.at > spot.at) problems.push({ momentId: termId, problem: 'listen-for must come before its spotlight' })
    else if (listen.minLevel !== spot.minLevel) problems.push({ momentId: termId, problem: 'listen-for and spotlight levels differ' })
  }
  return problems
}

/**
 * Splits guide text into runs in the learner's language and in the language they're learning. The
 * script writer wraps anything said in the target language in [[double brackets]], so it can be voiced
 * with a native accent and shown in italics. Brackets never nest; a stray bracket is kept as text.
 */
export function languageRuns(text: string): { text: string; target: boolean }[] {
  const runs: { text: string; target: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(/\[\[([^\[\]]+)\]\]/g)) {
    if (m.index! > last) runs.push({ text: text.slice(last, m.index), target: false })
    runs.push({ text: m[1]!, target: true })
    last = m.index! + m[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), target: false })
  return runs.filter((r) => r.text.trim().length > 0)
}

/**
 * How a guide line is sent to the voice. `mixed: false` (Chirp, Gemini): each [[ ]] run on its own in
 * the target language, the rest in the learner's language. `mixed: true` (Eleven v4, which says
 * embedded target words natively): the line goes as one call, except a term the guide repeats on
 * its own ("Here's Anna: {term}. [[försenad]]. It means delayed.") which stays a separate, slower
 * segment in the target language. A run counts as on its own when nothing but punctuation sits
 * between it and the start of the line or the end of the previous sentence.
 */
export function voiceSegments(text: string, opts: { mixed: boolean }): { text: string; target: boolean }[] {
  const runs = languageRuns(text)
  if (!opts.mixed) return runs.filter((r) => /\p{L}|\p{N}/u.test(r.text)).map((r) => ({ text: r.text.trim(), target: r.target }))
  const out: { text: string; target: boolean }[] = []
  let line = ''
  const flush = () => {
    // Punctuation left over from a repeat ("…]]. It means") isn't spoken at the start of a line.
    const t = line.replace(/^[\s.,;:!?…–—-]+/u, '').trim()
    if (/\p{L}|\p{N}/u.test(t)) out.push({ text: t, target: false })
    line = ''
  }
  runs.forEach((r) => {
    if (!r.target) {
      line += r.text
      return
    }
    const before = line.replace(/^[\s.,;:!?…–—-]+/u, '').trimEnd()
    const alone = before === '' || /[.!?…]["”»)]?$/u.test(before)
    if (alone) {
      flush()
      out.push({ text: r.text.trim(), target: true })
    } else line += r.text
  })
  flush()
  return out
}

/** Guide text without the [[ ]] marks, for anywhere it's shown or read as plain text. */
export function withoutLanguageMarks(text: string): string {
  return text.replace(/\[\[([^\[\]]+)\]\]/g, '$1')
}

/**
 * Bumped when lesson plans are written differently, so episodes prepared before are rewritten and
 * re-voiced from their saved transcript. 2: target-language text marked [[ ]] and read in that
 * language; word moments placed in the conversation.
 */
/** 3 (14 Oct 2026): calmer, context-first scripts; the guide repeats each term slowly. */
/**
 * 4 (18 Oct 2026): moments only at natural pauses (a finished answer, a question), planned at
 * Hands-on density of about one a minute and ranked so Standard and Light play the best subset.
 */
export const LESSON_PLAN_VERSION = 4
