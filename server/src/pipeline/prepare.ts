import {
  buildSegments,
  costUSD,
  estimateDifficulty,
  estimatePrepCostUSD,
  type Difficulty,
  type LessonPlan,
  type Transcript,
  type Usage,
  type Word,
} from '@polycast/core'
import { UsageMeter, type SpendGuard } from '../budget'
import { withRetry } from '../retry'
import type { SpeechSynth, Storage, TextModel, Transcriber } from '../providers/types'
import type { Guide } from '../voices'
import { assemblePlan, writePlanDraft } from './lessonPlan'
import { buildGlossary } from './glossary'
import { translateSegments } from './translate'
import { voicePlan } from './voice'

export type Stage = 'transcribing' | 'translating' | 'writing' | 'voicing' | 'done'

export interface PrepareInput {
  jobId: string
  episodeId: string
  audioUrl: string
  durationSec: number
  /** The episode's language, from the feed or the learner's choice. */
  language: string
  nativeLanguage: string
  guide: Guide
  /** Word-timed words from the publisher's own transcript, when it has one. */
  feedWords?: Word[]
}

export interface PrepareDeps {
  transcriber: Transcriber
  text: TextModel
  speech: SpeechSynth
  storage: Storage
  guard: SpendGuard
  onStage?: (stage: Stage) => void | Promise<void>
}

export interface PrepareResult {
  transcript: Transcript
  plan: LessonPlan
  difficulty: Difficulty
  usage: Usage
  costUSD: number
  /** Draft items that couldn't be placed, for quality review. */
  dropped: string[]
}

export class EmptyTranscript extends Error {
  constructor() {
    super('No speech was found in this episode')
    this.name = 'EmptyTranscript'
  }
}

/**
 * Prepares one episode: transcript, subtitles, lesson plan and guide audio. The whole estimated cost
 * is reserved against the daily cap before anything runs, then settled with the real usage, even if
 * a step fails part-way.
 */
export async function prepareEpisode(input: PrepareInput, deps: PrepareDeps): Promise<PrepareResult> {
  const meter = new UsageMeter()
  await deps.guard.reserve(input.jobId, estimatePrepCostUSD(input.durationSec, { feedTranscript: Boolean(input.feedWords) }))
  try {
    await deps.onStage?.('transcribing')
    let words = input.feedWords
    if (!words) {
      const result = await withRetry(() => deps.transcriber.transcribe({ audioUrl: input.audioUrl, language: input.language, durationSec: input.durationSec }))
      meter.add(result.usage)
      words = result.words
    }
    if (words.length === 0) throw new EmptyTranscript()

    await deps.onStage?.('translating')
    const segments = await translateSegments(buildSegments(words), input.language, input.nativeLanguage, deps.text, meter)
    const transcript: Transcript = { language: input.language, source: input.feedWords ? 'feed' : 'scribe', words, segments }
    transcript.glossary = await buildGlossary(transcript, input.nativeLanguage, deps.text, meter)

    await deps.onStage?.('writing')
    const draft = await writePlanDraft(transcript, input.nativeLanguage, input.durationSec, deps.text, meter)
    const { plan: unvoiced, dropped } = assemblePlan(draft, transcript, {
      episodeId: input.episodeId,
      nativeLanguage: input.nativeLanguage,
      durationSec: input.durationSec,
    })

    await deps.onStage?.('voicing')
    const plan = await voicePlan(unvoiced, input.guide, { speech: deps.speech, storage: deps.storage, meter })

    await deps.onStage?.('done')
    return {
      transcript,
      plan,
      difficulty: estimateDifficulty(words, { language: input.language }),
      usage: meter.usage,
      costUSD: costUSD(meter.usage),
      dropped,
    }
  } finally {
    await deps.guard.settle(input.jobId, meter.usage)
  }
}

/** Voices an already-prepared plan for a second guide (a learner who picked Leo, say). */
export async function voiceForGuide(
  jobId: string,
  plan: LessonPlan,
  guide: Guide,
  durationSec: number,
  deps: Pick<PrepareDeps, 'speech' | 'storage' | 'guard'>,
): Promise<{ plan: LessonPlan; usage: Usage }> {
  const meter = new UsageMeter()
  const estimate = costUSD({ transcriptionSec: 0, textInTokens: 0, textOutTokens: 0, ttsAudioSec: durationSec * 0.25 })
  await deps.guard.reserve(jobId, estimate)
  try {
    const voiced = await voicePlan(plan, guide, { speech: deps.speech, storage: deps.storage, meter })
    return { plan: voiced, usage: meter.usage }
  } finally {
    await deps.guard.settle(jobId, meter.usage)
  }
}
