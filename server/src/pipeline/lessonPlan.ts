import {
  LESSON_PLAN_VERSION,
  withoutLanguageMarks,
  assignMomentLevels,
  findBreaks,
  findOccurrences,
  KIND_MIN_LEVEL,
  sentenceClip,
  snapToNaturalPause,
  validateMoments,
  wordClip,
  type Clip,
  type GuideMoment,
  type Host,
  type LessonPlan,
  type Primer,
  type PrimerTheme,
  type PrimerWord,
  type Question,
  type RankedUnit,
  type Segment,
  type Transcript,
} from '@polycast/core'
import { languageName } from './languages'
import { withRetry } from '../retry'
import type { TextModel } from '../providers/types'
import type { UsageMeter } from '../budget'

/** What the lesson-plan writer returns, before Polycast places it on the episode's timeline. */
export interface PlanDraft {
  hosts: Host[]
  summary: string
  warmup: { script: string; terms: DraftTerm[] }
  chapters: { startSegmentId: string; title: string; recap: string }[]
  wordMoments: (DraftTerm & { priority: number; listenFor: string; spotlight: string })[]
  cultureNotes: { segmentId: string; script: string }[]
  quickQuestions: { segmentId: string; prompt: string; options: string[]; answerIndex: number }[]
  wrapUp: { script: string; questions: Question[] }
  /** Optional so drafts from older prompts (and test fixtures) still assemble. */
  primer?: { gist: string; gistNative: string; words: DraftTerm[]; themes: { title: string; segmentId: string }[] }
  /** One shareable culture line for the lesson recap card (PC-1019-F01). Optional for older drafts. */
  recap?: { didYouKnow: string }
}

interface DraftTerm {
  /** Exactly as spoken in the segment. */
  text: string
  lemma: string
  meaning: string
  segmentId: string
}

const term = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    lemma: { type: 'string' },
    meaning: { type: 'string' },
    segmentId: { type: 'string' },
  },
  required: ['text', 'lemma', 'meaning', 'segmentId'],
}

const question = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    answerIndex: { type: 'integer' },
  },
  required: ['prompt', 'options', 'answerIndex'],
}

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    hosts: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'description'] } },
    summary: { type: 'string' },
    warmup: { type: 'object', properties: { script: { type: 'string' }, terms: { type: 'array', items: term } }, required: ['script', 'terms'] },
    chapters: {
      type: 'array',
      items: { type: 'object', properties: { startSegmentId: { type: 'string' }, title: { type: 'string' }, recap: { type: 'string' } }, required: ['startSegmentId', 'title', 'recap'] },
    },
    wordMoments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ...term.properties, priority: { type: 'integer' }, listenFor: { type: 'string' }, spotlight: { type: 'string' } },
        required: [...term.required, 'priority', 'listenFor', 'spotlight'],
      },
    },
    cultureNotes: { type: 'array', items: { type: 'object', properties: { segmentId: { type: 'string' }, script: { type: 'string' } }, required: ['segmentId', 'script'] } },
    quickQuestions: { type: 'array', items: { type: 'object', properties: { segmentId: { type: 'string' }, ...question.properties }, required: ['segmentId', ...question.required] } },
    wrapUp: { type: 'object', properties: { script: { type: 'string' }, questions: { type: 'array', items: question } }, required: ['script', 'questions'] },
    primer: {
      type: 'object',
      properties: {
        gist: { type: 'string' },
        gistNative: { type: 'string' },
        words: { type: 'array', items: term },
        themes: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, segmentId: { type: 'string' } }, required: ['title', 'segmentId'] } },
      },
      required: ['gist', 'gistNative', 'words', 'themes'],
    },
    recap: { type: 'object', properties: { didYouKnow: { type: 'string' } }, required: ['didYouKnow'] },
  },
  required: ['hosts', 'summary', 'warmup', 'chapters', 'wordMoments', 'cultureNotes', 'quickQuestions', 'wrapUp', 'primer', 'recap'],
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function planPrompt(transcript: Transcript, nativeLanguage: string, durationSec: number): { system: string; prompt: string } {
  const target = languageName(transcript.language)
  const native = languageName(nativeLanguage)
  const minutes = Math.round(durationSec / 60)
  const system = `You are Polycast's lesson-plan writer. A learner of ${target} (roughly A2 to B2) listens to a real ${target} podcast. A guide speaks to them in ${native} at natural pauses to keep them on track and teach a little as they go. You write what the guide says. The podcast is the star: be brief, warm, plain and accurate. Write for an adult, never childish or over-excited. Never state anything the episode doesn't say. Use British English spelling when writing English. Write to be heard, not read: short spoken sentences, one idea each, nothing rushed. The learner has been listening half-passively, so before teaching anything, say in a few words where we are in the conversation (who is talking, about what). Never let a host clip start straight after a word: give it a short lead-in, such as "Here's Anna:". Whenever the guide says anything in ${target} (a word, a phrase, an example sentence), wrap exactly that ${target} text in double square brackets, like [[försenad]], so it's read in a ${target} voice; never wrap ${native}, and never wrap placeholders such as {term} or {sentence}.`

  const prompt = `The episode is ${minutes} minutes long. Its transcript follows, one subtitle line per row as "id [m:ss] speaker: text".

Write a lesson plan:
- hosts: who is talking, by name if they say it, with a few words each to tell them apart.
- summary: one or two sentences on what the episode is about.
- warmup.terms: 3 useful words or phrases to listen for. warmup.script (under 60 words): who's talking, what it's about, then introduce each term, writing {term1}, {term2}, {term3} where the host's own voice will say it, followed by its meaning.
- chapters: split the episode where the conversation moves on, about one every 6 to 10 minutes. For each, the id of its first line, a short title, and recap (under 40 words): what was said in that chapter, aimed at what a learner at this level probably missed.
- wordMoments: about one every 2 minutes. Pick words or short phrases an intermediate learner would find useful in everyday life: not names, not words that look the same in ${native}, and spread through the episode. Copy text exactly as it appears in the line given by segmentId. priority from 1 to 10 (10 = most useful). Teach each term inside the conversation, at an unhurried pace, so the learner keeps track of it. Each time, the learner should hear the term twice: once in the host's voice, then once from the guide, slowly, in [[ ]].
  listenFor (under 30 words): said just before the host says it. First where we are, then a lead-in and {term} (the host saying it), then the guide repeats it in [[ ]], then what it means, e.g. "They're complaining about the trains now. Here's Anna: {term}. [[försenad]]. It means delayed. Listen out for it."
  spotlight (under 60 words): said just after. Who said it and why, a lead-in, then {sentence} (the host's line again), then the guide repeats the key part in [[ ]], what it means here, and one more everyday example in [[ ]] with its meaning, e.g. "That was Anna, fed up with her commute: {sentence} [[Tåget var försenat]]: the train was late. You might say: [[Jag är lite försenad]], I'm running a bit late." 
- cultureNotes: only where a reference, joke or idiom would lose a learner (often none; at most 1 every 10 minutes). Under 35 words each, after the line it relates to, starting with who said it.
- quickQuestions: about one every 3 minutes, checking the gist of what was just said, after the given line. The prompt starts with a few words of context (e.g. "Erik was just talking about his old camera."), then asks. Three short options, one correct.
- Placing moments: the guide only ever steps in once a speaker has finished their answer or their bit, or straight after someone asks a question; never mid-sentence or mid-exchange. For culture notes and quick questions, give the id of the line where that happens. Spread everything out through the episode rather than bunching it.
- wrapUp: script (under 70 words) recapping the episode warmly and honestly, and 3 questions on its content.
- recap: didYouKnow is one surprising, friendly fact about the culture, place or topic of this episode, in ${native}, under 20 words, that a learner would enjoy sharing (e.g. "Swedes have a word, fika, for a proper coffee break with friends."). No [[ ]] marks.
- primer: a short warm-up the learner reads before pressing play. No [[ ]] marks anywhere in the primer. gist: two or three short sentences on what the episode is about, in simple ${target} a learner at A2 could follow. gistNative: the same in ${native}. words: the 5 to 8 most useful words or short phrases to listen for (they may repeat warm-up or word-moment terms), copied exactly as spoken in the line given by segmentId, with dictionary form and meaning in ${native}. themes: the 2 to 4 main themes, a few words each in ${native}, with the id of the line where each first comes up.

Transcript:
${transcript.segments.map((s) => `${s.id} [${clock(s.start)}] ${s.speaker ?? '?'}: ${s.text}`).join('\n')}`
  return { system, prompt }
}

export async function writePlanDraft(transcript: Transcript, nativeLanguage: string, durationSec: number, model: TextModel, meter: UsageMeter): Promise<PlanDraft> {
  const { system, prompt } = planPrompt(transcript, nativeLanguage, durationSec)
  const { data, usage } = await withRetry(() => model.generateJson<PlanDraft>({ system, prompt, schema: PLAN_SCHEMA }))
  meter.add(usage)
  return data
}

/** Where a drafted term is actually spoken: in its line if possible, else its nearest occurrence. */
function locateTerm(transcript: Transcript, t: DraftTerm) {
  const seg = transcript.segments.find((s) => s.id === t.segmentId)
  const all = findOccurrences(transcript.words, t.text, transcript.language)
  if (all.length === 0) return undefined
  if (!seg) return all[0]
  return all.find((o) => o.first >= seg.wordStart && o.last < seg.wordEnd) ?? all.reduce((a, b) => (Math.abs(b.start - seg.start) < Math.abs(a.start - seg.start) ? b : a))
}

/** Culture notes are only written where a learner would be lost, so they rank above most words. */
const CULTURE_NOTE_PRIORITY = 7
const QUICK_QUESTION_PRIORITY = 5

const segEnd = (segments: Segment[], id: string) => segments.find((s) => s.id === id)?.end

export interface AssembleResult {
  plan: LessonPlan
  /** Draft items dropped because they couldn't be placed or failed validation. */
  dropped: string[]
}

/**
 * Places the draft on the episode's timeline: snaps every moment to a natural break, cuts the host's
 * clips, decides which level hears each word moment, and drops anything that doesn't fit the rules.
 */
export function assemblePlan(draft: PlanDraft, transcript: Transcript, opts: { episodeId: string; nativeLanguage: string; durationSec: number }): AssembleResult {
  const { words, segments } = transcript
  const breaks = findBreaks(words)
  const lastBreak = breaks.at(-1)?.at ?? opts.durationSec
  const dropped: string[] = []
  const moments: GuideMoment[] = []
  let n = 0
  const id = (kind: string) => `${kind}-${++n}`

  // Warm-up: each {termN} becomes the host saying it.
  {
    const clips: Clip[] = []
    let script = draft.warmup.script
    draft.warmup.terms.forEach((t, i) => {
      const occ = locateTerm(transcript, t)
      const ph = `{term${i + 1}}`
      if (!occ) {
        script = script.replace(ph, `[[${t.text}]]`)
        dropped.push(`warm-up clip for "${t.text}"`)
        return
      }
      script = script.replace(ph, `{clip:${clips.length}}`)
      clips.push(wordClip(words, occ))
    })
    moments.push({ id: id('warmup'), kind: 'warmup', at: 0, minLevel: KIND_MIN_LEVEL.warmup, script, clips })
  }

  // Word moments, culture notes and quick questions are ranked, then each level hears the best that
  // keep its spacing (assignMomentLevels). Warm-up, recaps and wrap-up are fixed.
  const ranked: { priority: number; moments: GuideMoment[]; label?: string }[] = []

  // Word moments: listen-for just before the host says it, spotlight at the next natural pause after.
  for (const wm of draft.wordMoments) {
    const occ = locateTerm(transcript, wm)
    if (!occ) {
      dropped.push(`word moment "${wm.text}": not found in transcript`)
      continue
    }
    const before = snapToNaturalPause(occ.start, breaks, 'before', 60)
    const after = snapToNaturalPause(occ.end, breaks, 'after', 90)
    if (!before || !after || before.at >= after.at) {
      dropped.push(`word moment "${wm.text}": no natural break nearby`)
      continue
    }
    const termId = `t${ranked.length + 1}`
    const term = { text: wm.text, lemma: wm.lemma, meaning: wm.meaning }
    const clip = wordClip(words, occ)
    const line = sentenceClip(segments, occ.first) ?? clip
    const listen: GuideMoment = { id: id('listen'), kind: 'listenFor', at: before.at, minLevel: KIND_MIN_LEVEL.listenFor, script: wm.listenFor.replaceAll('{term}', '{clip:0}'), clips: [clip], term, termId }
    const spot: GuideMoment = {
      id: id('spot'),
      kind: 'spotlight',
      at: after.at,
      minLevel: KIND_MIN_LEVEL.spotlight,
      script: wm.spotlight.replaceAll('{term}', '{clip:0}').replaceAll('{sentence}', '{clip:1}'),
      clips: [clip, line],
      term,
      termId,
    }
    ranked.push({ priority: wm.priority, moments: [listen, spot], label: `word moment "${wm.text}"` })
  }
  // Checkpoints: a recap of each chapter, at the break where the next chapter begins. The last
  // chapter's recap is left to the wrap-up.
  draft.chapters.forEach((ch, i) => {
    const next = draft.chapters[i + 1]
    if (!next) return
    const startOfNext = segments.find((s) => s.id === next.startSegmentId)?.start
    const b = startOfNext === undefined ? undefined : snapToNaturalPause(startOfNext, breaks, 'before', 30)
    if (!b) {
      dropped.push(`checkpoint after "${ch.title}": no break where the next chapter starts`)
      return
    }
    moments.push({ id: id('checkpoint'), kind: 'checkpoint', at: b.at, minLevel: KIND_MIN_LEVEL.checkpoint, script: ch.recap, clips: [] })
  })

  for (const cn of draft.cultureNotes) {
    const end = segEnd(segments, cn.segmentId)
    const b = end === undefined ? undefined : snapToNaturalPause(end, breaks, 'after', 60)
    if (!b) dropped.push('culture note: no break after its line')
    else ranked.push({ priority: CULTURE_NOTE_PRIORITY, moments: [{ id: id('culture'), kind: 'cultureNote', at: b.at, minLevel: KIND_MIN_LEVEL.cultureNote, script: cn.script, clips: [] }] })
  }

  for (const q of draft.quickQuestions) {
    const end = segEnd(segments, q.segmentId)
    const b = end === undefined ? undefined : snapToNaturalPause(end, breaks, 'after', 60)
    if (!b) dropped.push('quick question: no break after its line')
    else
      ranked.push({ priority: QUICK_QUESTION_PRIORITY, moments: [{
        id: id('question'),
        kind: 'quickQuestion',
        at: b.at,
        minLevel: KIND_MIN_LEVEL.quickQuestion,
        script: q.prompt,
        clips: [],
        // The question is read aloud from the script (marks and all); on screen it's plain text.
        question: plainQuestion(q),
        waits: true,
      }] })
  }

  // Rank and space them out (PC-1017-F13, F14).
  // The warm-up plays before the episode starts, so it doesn't crowd the first minutes.
  const fixedTimes = [...moments.filter((m) => m.kind !== 'warmup').map((m) => m.at), lastBreak]
  const units: RankedUnit[] = ranked.map((r, i) => ({
    id: String(i),
    start: Math.min(...r.moments.map((m) => m.at)),
    end: Math.max(...r.moments.map((m) => m.at)),
    priority: r.priority,
    floor: r.moments[0]!.minLevel,
  }))
  const levels = assignMomentLevels(units, fixedTimes)
  ranked.forEach((r, i) => {
    const level = levels.get(String(i))
    if (!level) dropped.push(`${r.label ?? r.moments[0]!.kind}: too close to a more useful moment`)
    else moments.push(...r.moments.map((m) => ({ ...m, minLevel: level })))
  })

  moments.push({
    id: id('wrapup'),
    kind: 'wrapUp',
    at: lastBreak,
    minLevel: KIND_MIN_LEVEL.wrapUp,
    script: draft.wrapUp.script,
    clips: [],
  })

  const didYouKnow = recapLine(draft)
  const primer = draft.primer ? assemblePrimer(draft.primer, transcript, dropped, draft.chapters) : undefined

  // Drop whatever still breaks the rules, and keep word-moment pairs together.
  const problems = validateMoments(moments, opts.durationSec)
  const badIds = new Set(problems.map((p) => p.momentId))
  const badTerms = new Set(moments.filter((m) => m.termId && badIds.has(m.id)).map((m) => m.termId))
  for (const p of problems) dropped.push(`${p.momentId}: ${p.problem}`)
  const kept = moments.filter((m) => !badIds.has(m.id) && !(m.termId && (badTerms.has(m.termId) || badIds.has(m.termId))))

  return {
    plan: {
      episodeId: opts.episodeId,
      version: LESSON_PLAN_VERSION,
      targetLanguage: transcript.language,
      nativeLanguage: opts.nativeLanguage,
      hosts: draft.hosts,
      summary: draft.summary,
      moments: kept.sort((a, b) => a.at - b.at),
      wrapUpQuestions: wrapUpQuestions(draft),
      ...(primer ? { primer } : {}),
      ...(didYouKnow ? { recap: { didYouKnow } } : {}),
    },
    dropped,
  }
}

/** The recap card's culture line (PC-1019-F01): trimmed, without guide marks, at most 30 words. */
export function recapLine(draft: PlanDraft): string | undefined {
  const t = draft.recap?.didYouKnow?.replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim()
  if (!t) return undefined
  const words = t.split(' ')
  return words.length <= 30 ? t : `${words.slice(0, 30).join(' ').replace(/[,;:.]+$/, '')}…`
}

/** Most words a primer lists, and the fewest that make it worth showing (PC-1017-P1). */
export const PRIMER_MAX_WORDS = 8
export const PRIMER_MIN_WORDS = 3

/**
 * Places the primer on the timeline: each word at the first time the host says it (with the clip of
 * them saying it), each theme where its line starts. Words the host never says are dropped, repeats
 * kept once, and the list is ordered as they come up. With too few words left there's no primer.
 */
export function assemblePrimer(
  draft: NonNullable<PlanDraft['primer']>,
  transcript: Transcript,
  dropped: string[] = [],
  chapters: PlanDraft['chapters'] = [],
): Primer | undefined {
  const words: PrimerWord[] = []
  const seen = new Set<string>()
  for (const t of draft.words) {
    const key = t.lemma.toLocaleLowerCase()
    if (seen.has(key)) continue
    const all = findOccurrences(transcript.words, t.text, transcript.language)
    const occ = all[0]
    if (!occ) {
      dropped.push(`primer word "${t.text}": not found in transcript`)
      continue
    }
    seen.add(key)
    words.push({ text: t.text, lemma: t.lemma, meaning: withoutLanguageMarks(t.meaning), at: occ.start, clip: wordClip(transcript.words, occ) })
    if (words.length === PRIMER_MAX_WORDS) break
  }
  words.sort((a, b) => a.at - b.at)
  if (words.length < PRIMER_MIN_WORDS || !draft.gist.trim()) {
    dropped.push('primer: too few words to listen for')
    return undefined
  }
  const themes: PrimerTheme[] = draft.themes
    .map((th) => ({ title: withoutLanguageMarks(th.title).trim(), at: transcript.segments.find((s) => s.id === th.segmentId)?.start ?? -1 }))
    .filter((th) => th.title && th.at >= 0)
    .sort((a, b) => a.at - b.at)
  // The episode map's sections: the plan's chapters, where each starts (PC-1017-P5).
  const sections: PrimerTheme[] = chapters
    .map((ch) => ({ title: withoutLanguageMarks(ch.title).trim(), at: transcript.segments.find((s) => s.id === ch.startSegmentId)?.start ?? -1 }))
    .filter((ch) => ch.title && ch.at >= 0)
    .sort((a, b) => a.at - b.at)
  return {
    gist: withoutLanguageMarks(draft.gist).trim(),
    gistNative: withoutLanguageMarks(draft.gistNative).trim(),
    words,
    themes,
    ...(sections.length ? { sections } : {}),
  }
}

/** The wrap-up's extra questions travel with the plan for the end-of-episode screen. */
export function wrapUpQuestions(draft: PlanDraft): Question[] {
  return draft.wrapUp.questions.filter((q) => q.options.length >= 2 && q.answerIndex >= 0 && q.answerIndex < q.options.length).map(plainQuestion)
}

const plainQuestion = (q: Question): Question => ({ prompt: withoutLanguageMarks(q.prompt), options: q.options.map(withoutLanguageMarks), answerIndex: q.answerIndex })
