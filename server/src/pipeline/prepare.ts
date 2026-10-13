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
  /** A transcript (with subtitles and glossary) saved by an earlier attempt, so a retry skips straight to writing. */
  savedTranscript?: Transcript
  /** The fingerprint an earlier attempt stored with that transcript, if any. */
  savedSyncUrl?: string
}

export interface PrepareDeps {
  transcriber: Transcriber
  text: TextModel
  speech: SpeechSynth
  storage: Storage
  guard: SpendGuard
  onStage?: (stage: Stage) => void | Promise<void>
  /** Keeps the finished transcript, so a later attempt doesn't pay to transcribe and translate again. */
  saveTranscript?: (transcript: Transcript) => Promise<void>
  /**
   * With both of these, the episode is downloaded once: those bytes are fingerprinted and sent to
   * transcription, so the app can line our timings up with each listener's copy (adverts differ).
   */
  downloadAudio?: (url: string) => Promise<Uint8Array>
  fingerprint?: (audio: Uint8Array) => Promise<Uint8Array>
}

/** Where an episode's fingerprint is stored. */
export const syncPath = (episodeId: string) => `sync/${episodeId}.fp`

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
  const resumed = input.savedTranscript
  let syncUrl = resumed ? input.savedSyncUrl : undefined
  await deps.guard.reserve(input.jobId, estimatePrepCostUSD(input.durationSec, { feedTranscript: Boolean(input.feedWords || resumed) }))
  try {
    let transcript: Transcript
    if (resumed) {
      transcript = resumed
    } else {
      await deps.onStage?.('transcribing')
      let words = input.feedWords
      if (!words) {
        let audio: Uint8Array | undefined
        if (deps.downloadAudio && deps.fingerprint) {
          audio = await withRetry(() => deps.downloadAudio!(input.audioUrl))
          syncUrl = await deps.storage.put(syncPath(input.episodeId), await deps.fingerprint(audio), 'application/octet-stream')
        }
        const result = await withRetry(() => deps.transcriber.transcribe({ audioUrl: input.audioUrl, language: input.language, durationSec: input.durationSec, audio }))
        audio = undefined // never kept
        meter.add(result.usage)
        words = result.words
      }
      if (words.length === 0) throw new EmptyTranscript()

      await deps.onStage?.('translating')
      const segments = await translateSegments(buildSegments(words), input.language, input.nativeLanguage, deps.text, meter)
      transcript = { language: input.language, source: input.feedWords ? 'feed' : 'scribe', words, segments }
      transcript.glossary = await buildGlossary(transcript, input.nativeLanguage, deps.text, meter)
      await deps.saveTranscript?.(transcript)
    }
    const words = transcript.words

    await deps.onStage?.('writing')
    const draft = await writePlanDraft(transcript, input.nativeLanguage, input.durationSec, deps.text, meter)
    const { plan: unvoiced, dropped } = assemblePlan(draft, transcript, {
      episodeId: input.episodeId,
      nativeLanguage: input.nativeLanguage,
      durationSec: input.durationSec,
    })

    await deps.onStage?.('voicing')
    const voiced = await voicePlan(unvoiced, input.guide, { speech: deps.speech, storage: deps.storage, meter })
    const plan = syncUrl ? { ...voiced, syncUrl } : voiced

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
