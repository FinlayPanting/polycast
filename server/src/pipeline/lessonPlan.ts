import {
  LESSON_PLAN_VERSION,
  withoutLanguageMarks,
  assignWordMomentLevels,
  findBreaks,
  findOccurrences,
  KIND_MIN_LEVEL,
  sentenceClip,
  snapToBreak,
  validateMoments,
  wordClip,
  type Clip,
  type GuideMoment,
  type Host,
  type LessonPlan,
  type Question,
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
  },
  required: ['hosts', 'summary', 'warmup', 'chapters', 'wordMoments', 'cultureNotes', 'quickQuestions', 'wrapUp'],
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
  const system = `You are Polycast's lesson-plan writer. A learner of ${target} (roughly A2 to B2) listens to a real ${target} podcast. A guide speaks to them in ${native} at natural pauses to keep them on track and teach a little as they go. You write what the guide says. The podcast is the star: be brief, warm, plain and accurate. Write for an adult, never childish or over-excited. Never state anything the episode doesn't say. Use British English spelling when writing English. Whenever the guide says anything in ${target} (a word, a phrase, an example sentence), wrap exactly that ${target} text in double square brackets, like [[försenad]], so it's read in a ${target} voice; never wrap ${native}, and never wrap placeholders such as {term} or {sentence}.`

  const prompt = `The episode is ${minutes} minutes long. Its transcript follows, one subtitle line per row as "id [m:ss] speaker: text".

Write a lesson plan:
- hosts: who is talking, by name if they say it, with a few words each to tell them apart.
- summary: one or two sentences on what the episode is about.
- warmup.terms: 3 useful words or phrases to listen for. warmup.script (under 60 words): who's talking, what it's about, then introduce each term, writing {term1}, {term2}, {term3} where the host's own voice will say it, followed by its meaning.
- chapters: split the episode where the conversation moves on, about one every 6 to 10 minutes. For each, the id of its first line, a short title, and recap (under 40 words): what was said in that chapter, aimed at what a learner at this level probably missed.
- wordMoments: about one every 2 minutes. Pick words or short phrases an intermediate learner would find useful in everyday life: not names, not words that look the same in ${native}, and spread through the episode. Copy text exactly as it appears in the line given by segmentId. priority from 1 to 10 (10 = most useful). Teach each term inside the conversation, so the learner keeps track of it: listenFor (under 25 words): said just before the host says it; first a short clause on what the hosts are talking about right then, then the term, e.g. "They're complaining about the trains now. Listen for {term}: it means delayed." spotlight (under 50 words): said just after; replay the host's line with {sentence}, say what it means in this part of the conversation (who said it and why), then give one more everyday example in ${target} with its meaning.
- cultureNotes: only where a reference, joke or idiom would lose a learner (often none; at most 1 every 10 minutes). Under 30 words each, after the line it relates to.
- quickQuestions: about one every 5 minutes, checking the gist of what was just said, after the given line. Three short options, one correct.
- wrapUp: script (under 70 words) recapping the episode warmly and honestly, and 3 questions on its content.

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

  // Word moments: listen-for just before the host says it, spotlight at the next break after.
  const placed: { termId: string; occursAt: number; priority: number; listen: GuideMoment; spot: GuideMoment }[] = []
  for (const wm of draft.wordMoments) {
    const occ = locateTerm(transcript, wm)
    if (!occ) {
      dropped.push(`word moment "${wm.text}": not found in transcript`)
      continue
    }
    const before = snapToBreak(occ.start, breaks, 'before', 60)
    const after = snapToBreak(occ.end, breaks, 'after', 90)
    if (!before || !after || before.at >= after.at) {
      dropped.push(`word moment "${wm.text}": no natural break nearby`)
      continue
    }
    const termId = `t${placed.length + 1}`
    const term = { text: wm.text, lemma: wm.lemma, meaning: wm.meaning }
    const clip = wordClip(words, occ)
    const line = sentenceClip(segments, occ.first) ?? clip
    const listen: GuideMoment = { id: id('listen'), kind: 'listenFor', at: before.at, minLevel: 'standard', script: wm.listenFor.replaceAll('{term}', '{clip:0}'), clips: [clip], term, termId }
    const spot: GuideMoment = {
      id: id('spot'),
      kind: 'spotlight',
      at: after.at,
      minLevel: 'standard',
      script: wm.spotlight.replaceAll('{term}', '{clip:0}').replaceAll('{sentence}', '{clip:1}'),
      clips: [clip, line],
      term,
      termId,
    }
    placed.push({ termId, occursAt: occ.start, priority: wm.priority, listen, spot })
  }
  const levels = assignWordMomentLevels(placed)
  for (const p of placed) {
    const level = levels.get(p.termId)
    if (!level) {
      dropped.push(`word moment "${p.listen.term!.text}": too close to a more useful one`)
      continue
    }
    moments.push({ ...p.listen, minLevel: level }, { ...p.spot, minLevel: level })
  }

  // Checkpoints: a recap of each chapter, at the break where the next chapter begins. The last
  // chapter's recap is left to the wrap-up.
  draft.chapters.forEach((ch, i) => {
    const next = draft.chapters[i + 1]
    if (!next) return
    const startOfNext = segments.find((s) => s.id === next.startSegmentId)?.start
    const b = startOfNext === undefined ? undefined : snapToBreak(startOfNext, breaks, 'before', 30)
    if (!b) {
      dropped.push(`checkpoint after "${ch.title}": no break where the next chapter starts`)
      return
    }
    moments.push({ id: id('checkpoint'), kind: 'checkpoint', at: b.at, minLevel: KIND_MIN_LEVEL.checkpoint, script: ch.recap, clips: [] })
  })

  for (const cn of draft.cultureNotes) {
    const end = segEnd(segments, cn.segmentId)
    const b = end === undefined ? undefined : snapToBreak(end, breaks, 'after', 60)
    if (!b) dropped.push('culture note: no break after its line')
    else moments.push({ id: id('culture'), kind: 'cultureNote', at: b.at, minLevel: KIND_MIN_LEVEL.cultureNote, script: cn.script, clips: [] })
  }

  for (const q of draft.quickQuestions) {
    const end = segEnd(segments, q.segmentId)
    const b = end === undefined ? undefined : snapToBreak(end, breaks, 'after', 60)
    if (!b) dropped.push('quick question: no break after its line')
    else
      moments.push({
        id: id('question'),
        kind: 'quickQuestion',
        at: b.at,
        minLevel: KIND_MIN_LEVEL.quickQuestion,
        script: q.prompt,
        clips: [],
        // The question is read aloud from the script (marks and all); on screen it's plain text.
        question: plainQuestion(q),
        waits: true,
      })
  }

  moments.push({
    id: id('wrapup'),
    kind: 'wrapUp',
    at: lastBreak,
    minLevel: KIND_MIN_LEVEL.wrapUp,
    script: draft.wrapUp.script,
    clips: [],
  })

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
    },
    dropped,
  }
}

/** The wrap-up's extra questions travel with the plan for the end-of-episode screen. */
export function wrapUpQuestions(draft: PlanDraft): Question[] {
  return draft.wrapUp.questions.filter((q) => q.options.length >= 2 && q.answerIndex >= 0 && q.answerIndex < q.options.length).map(plainQuestion)
}

const plainQuestion = (q: Question): Question => ({ prompt: withoutLanguageMarks(q.prompt), options: q.options.map(withoutLanguageMarks), answerIndex: q.answerIndex })
