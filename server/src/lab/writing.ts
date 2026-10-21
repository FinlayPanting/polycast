import { lessonText, LEVELS, selectMoments, type LessonPlan, type Transcript } from '@polycast/core'
import { UsageMeter } from '../budget'
import { assemblePlan, planPrompt, writePlanDraft } from '../pipeline/lessonPlan'
import { geminiText } from '../providers/gemini'
import type { TextModel } from '../providers/types'
import { withRetry } from '../retry'
import { claudeText } from './anthropic'
import { CHARS_PER_SEC, estimateTokens, textCostUSD, textModel } from './prices'
import type { EpisodeForLab } from './moment'
import type { LabKeys } from './voice'

/**
 * The Lab's writing tests (PC-1021-L1): the same lesson plan, or the same guide moment, written by
 * different text models side by side with what each cost. Lesson plans are the Haiku audition of
 * PC-1021-06; moment rewrites test a prompt change on one line without preparing an episode.
 */

export function labTextModel(id: string, keys: LabKeys, fetchImpl: typeof fetch = fetch): TextModel {
  const info = textModel(id)
  if (!info) throw new Error(`Unknown text model ${id}`)
  if (info.provider === 'anthropic') {
    if (!keys.anthropic) throw new Error('Claude isn’t set up on the server (ANTHROPIC_API_KEY).')
    return claudeText(keys.anthropic, id, fetchImpl)
  }
  if (!keys.gemini) throw new Error('Gemini isn’t set up on the server (GEMINI_API_KEY).')
  return geminiText(keys.gemini, id, fetchImpl)
}

/** The first `minutes` of a transcript, so a comparison can stay cheap. 0 or less keeps it all. */
export function firstMinutes(t: Transcript, minutes: number): { transcript: Transcript; durationSec: number } {
  const full = t.segments.at(-1)?.end ?? 0
  if (!(minutes > 0) || minutes * 60 >= full) return { transcript: t, durationSec: full }
  const limit = minutes * 60
  const segments = t.segments.filter((s) => s.end <= limit)
  const lastWord = segments.at(-1)?.wordEnd ?? 0
  return { transcript: { ...t, segments, words: t.words.slice(0, lastWord) }, durationSec: segments.at(-1)?.end ?? limit }
}

/** Plans are about 30,000 tokens out an hour (as the preparation estimate assumes). */
const PLAN_OUT_TOKENS_PER_SEC = 30_000 / 3600

export function estimatePlanUSD(ep: EpisodeForLab, minutes: number, models: string[]): { model: string; usd: number }[] {
  const { transcript, durationSec } = firstMinutes(ep.transcript, minutes)
  const { system, prompt } = planPrompt(transcript, ep.nativeLanguage, durationSec)
  const inTok = estimateTokens(system.length + prompt.length + 3000)
  const outTok = Math.round(durationSec * PLAN_OUT_TOKENS_PER_SEC)
  return models.map((model) => ({ model, usd: textCostUSD(model, inTok, outTok) }))
}

export interface PlanResult {
  model: string
  ok: boolean
  error?: string
  costUSD: number
  inTokens: number
  outTokens: number
  seconds: number
  /** The plan as a readable page (the same view as /admin/lessons). */
  page?: string
  stats?: { moments: number; byKind: Record<string, number>; dropped: string[]; guideSecByLevel: Record<string, number> }
  plan?: LessonPlan
}

export async function comparePlans(ep: EpisodeForLab, models: string[], minutes: number, keys: LabKeys, fetchImpl: typeof fetch = fetch): Promise<PlanResult[]> {
  const { transcript, durationSec } = firstMinutes(ep.transcript, minutes)
  return Promise.all(
    models.map(async (model): Promise<PlanResult> => {
      const meter = new UsageMeter()
      const began = Date.now()
      try {
        const draft = await writePlanDraft(transcript, ep.nativeLanguage, durationSec, labTextModel(model, keys, fetchImpl), meter)
        const { plan, dropped } = assemblePlan(draft, transcript, { episodeId: ep.id, nativeLanguage: ep.nativeLanguage, durationSec })
        const u = meter.usage
        const byKind = plan.moments.reduce<Record<string, number>>((c, m) => ((c[m.kind] = (c[m.kind] ?? 0) + 1), c), {})
        // The plan isn't voiced, so guide time is estimated from its words (about 15 characters a second) plus the host's clips.
        const spoken = (ms: typeof plan.moments) => ms.reduce((a, m) => a + m.script.replace(/\{clip:\d+\}|\[\[|\]\]/g, '').length / CHARS_PER_SEC + m.clips.reduce((c, x) => c + (x.end - x.start), 0), 0)
        const guideSecByLevel = Object.fromEntries(LEVELS.map((l) => [l, Math.round(spoken(selectMoments(plan.moments, l)))]))
        return {
          model,
          ok: true,
          costUSD: textCostUSD(model, u.textInTokens, u.textOutTokens),
          inTokens: u.textInTokens,
          outTokens: u.textOutTokens,
          seconds: Math.round((Date.now() - began) / 100) / 10,
          page: lessonText({ title: ep.title, podcastTitle: ep.podcastTitle, guideId: ep.guideId, plan, transcript }),
          stats: { moments: plan.moments.length, byKind, dropped, guideSecByLevel },
          plan,
        }
      } catch (e) {
        const u = meter.usage
        return { model, ok: false, error: e instanceof Error ? e.message : String(e), costUSD: textCostUSD(model, u.textInTokens, u.textOutTokens), inTokens: u.textInTokens, outTokens: u.textOutTokens, seconds: Math.round((Date.now() - began) / 100) / 10 }
      }
    }),
  )
}

const SCRIPT_SCHEMA = { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] }

const KIND_BRIEF: Record<string, string> = {
  warmup: 'the warm-up before the episode starts: who is talking, what about, and the terms to listen for',
  listenFor: 'said just before the host says the term: where we are, a lead-in, the host saying it, the guide repeating it slowly in [[ ]], what it means',
  spotlight: 'said just after the host said the term: who said it and why, the host’s line again, the key part repeated in [[ ]], its meaning here, one more everyday example in [[ ]]',
  cultureNote: 'a short culture note on a reference, joke or idiom that would lose a learner, starting with who said it',
  quickQuestion: 'a quick gist question: a few words of context, then the question',
  chapterRecap: 'a recap of what was just said in this chapter, aimed at what a learner probably missed',
  wrapUp: 'the warm, honest wrap-up at the end of the episode',
}

/** The prompt for rewriting one moment: the plan writer's own rules, the moment's context and its current script. */
export function scriptPrompt(ep: EpisodeForLab, momentId: string, instruction?: string): { system: string; prompt: string; current: string } {
  const m = ep.plan.moments.find((x) => x.id === momentId)
  if (!m) throw new Error('That moment isn’t in this lesson plan')
  const { system } = planPrompt({ ...ep.transcript, segments: [] }, ep.nativeLanguage, 0)
  const near = ep.transcript.segments.filter((s) => s.end >= m.at - 150 && s.start <= m.at + 15)
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
  const clipText = m.clips.map((c, i) => {
    const said = ep.transcript.words.filter((w) => w.start >= c.start - 0.05 && w.start < c.end).map((w) => w.text).join(' ')
    return `{clip:${i}} = the host saying “${said}”`
  })
  const prompt = `Rewrite one thing the guide says. It is ${KIND_BRIEF[m.kind] ?? m.kind}. It plays at ${clock(m.at)}.

The conversation just before it (and just after), one subtitle line per row:
${near.map((s) => `[${clock(s.start)}] ${s.speaker ?? '?'}: ${s.text}`).join('\n')}

${clipText.length ? `It uses the host's own voice: ${clipText.join('; ')}. Keep each {clip:N} marker exactly where the host should be heard, with a lead-in before it.\n\n` : ''}${m.term ? `The term: “${(m.term as any).text}”, meaning ${(m.term as any).meaning}.\n\n` : ''}What the guide says now:
${m.script}
${instruction?.trim() ? `\nWhat to change: ${instruction.trim()}\n` : ''}
Reply with the new script only, in the same form (the same {clip:N} markers, target-language text in [[ ]]).`
  return { system, prompt, current: m.script }
}

export interface ScriptResult {
  model: string
  ok: boolean
  script?: string
  error?: string
  costUSD: number
  /** {clip:N} markers the new script lost or invented, which would break the moment. */
  clipProblems?: string[]
}

export function estimateScriptUSD(ep: EpisodeForLab, momentId: string, models: string[], instruction?: string) {
  const { system, prompt } = scriptPrompt(ep, momentId, instruction)
  const inTok = estimateTokens(system.length + prompt.length)
  return models.map((model) => ({ model, usd: textCostUSD(model, inTok, 250) }))
}

export async function compareScripts(ep: EpisodeForLab, momentId: string, models: string[], instruction: string | undefined, keys: LabKeys, fetchImpl: typeof fetch = fetch): Promise<{ current: string; results: ScriptResult[] }> {
  const { system, prompt, current } = scriptPrompt(ep, momentId, instruction)
  const markers = (s: string) => [...s.matchAll(/\{clip:(\d+)\}/g)].map((x) => x[0]).sort()
  const want = markers(current)
  const results = await Promise.all(
    models.map(async (model): Promise<ScriptResult> => {
      try {
        const { data, usage } = await withRetry(() => labTextModel(model, keys, fetchImpl).generateJson<{ script: string }>({ system, prompt, schema: SCRIPT_SCHEMA }))
        const script = String(data.script ?? '').trim()
        const got = markers(script)
        const clipProblems = [...want.filter((w) => !got.includes(w)).map((w) => `lost ${w}`), ...got.filter((g) => !want.includes(g)).map((g) => `invented ${g}`)]
        return { model, ok: true, script, costUSD: textCostUSD(model, usage.textInTokens ?? 0, usage.textOutTokens ?? 0), ...(clipProblems.length ? { clipProblems } : {}) }
      } catch (e) {
        return { model, ok: false, error: e instanceof Error ? e.message : String(e), costUSD: 0 }
      }
    }),
  )
  return { current, results }
}
