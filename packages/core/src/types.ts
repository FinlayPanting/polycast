/** Shared types for Polycast. Times are seconds from the start of the episode. */

/** ISO 639-1 code, e.g. "sv", "de". */
export type LanguageCode = string

export const LAUNCH_LANGUAGES = ['es', 'fr', 'de', 'it', 'pt', 'sv'] as const
export type LaunchLanguage = (typeof LAUNCH_LANGUAGES)[number]

export type GuidanceLevel = 'light' | 'standard' | 'handsOn'

/** One spoken word with timing, as returned by transcription. */
export interface Word {
  text: string
  start: number
  end: number
  speaker?: string
}

/** A subtitle line: a sentence or short run of words. */
export interface Segment {
  id: string
  start: number
  end: number
  speaker?: string
  text: string
  translation?: string
  /** Index of the first word and one past the last word in `Transcript.words`. */
  wordStart: number
  wordEnd: number
}

export interface Transcript {
  language: LanguageCode
  source: 'scribe' | 'feed'
  words: Word[]
  segments: Segment[]
}

/** A stretch of the episode's own audio, used to let the host say a word. */
export interface Clip {
  start: number
  end: number
}

export type MomentKind =
  | 'warmup'
  | 'listenFor'
  | 'spotlight'
  | 'cultureNote'
  | 'checkpoint'
  | 'quickQuestion'
  | 'wrapUp'

export interface Term {
  /** As the host says it, e.g. "försenad". */
  text: string
  /** Dictionary form, used for the word bank and old friends. */
  lemma: string
  /** Meaning in the learner's language, in this context. */
  meaning: string
}

export interface Question {
  prompt: string
  options: string[]
  answerIndex: number
}

/**
 * One thing the guide says. The script is in the learner's language; `{clip:N}` marks
 * where the N-th clip of the host's own voice plays.
 */
export interface GuideMoment {
  id: string
  kind: MomentKind
  /** When it plays: always at a natural break (or 0 for warm-up, the end for wrap-up). */
  at: number
  /** The lightest guidance level that includes this moment. */
  minLevel: GuidanceLevel
  script: string
  clips: Clip[]
  term?: Term
  /** Links a listen-for to its spotlight, which together make one word moment. */
  termId?: string
  question?: Question
  /** Hands-on quick questions wait for an answer before the episode resumes. */
  waits?: boolean
  /** Filled in once the guide audio exists. */
  audio?: { url: string; durationSec: number }
}

export interface Host {
  name: string
  description: string
}

export interface LessonPlan {
  episodeId: string
  version: number
  targetLanguage: LanguageCode
  nativeLanguage: LanguageCode
  hosts: Host[]
  summary: string
  moments: GuideMoment[]
}
