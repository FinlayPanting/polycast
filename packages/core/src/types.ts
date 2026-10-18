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
  /** Tap-a-word meanings, prepared with the episode: normalised word form → dictionary form and meaning. */
  glossary?: Record<string, GlossEntry>
}

export interface GlossEntry {
  lemma: string
  meaning: string
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
  /** Filled in once the guide audio exists: guide speech and host clips, played in order. */
  audio?: MomentAudio
}

export type AudioPart =
  | { kind: 'speech'; url: string; durationSec: number }
  | { kind: 'clip'; clipIndex: number }

export interface MomentAudio {
  parts: AudioPart[]
  /** Total length including host clips. */
  durationSec: number
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
  /** Questions on the wrap-up screen; tap to answer, or later from a notification. */
  wrapUpQuestions: Question[]
  /**
   * Fingerprint of the exact audio we transcribed (see sync.ts), so the app can line the lesson up
   * with the listener's own copy when adverts differ. Missing for episodes prepared before 13 Oct 2026
   * and for publisher transcripts.
   */
  syncUrl?: string
  /** Written once while preparing (PC-1017-P1); missing on plans written before 18 Oct 2026. */
  primer?: Primer
}

/**
 * The Episode Primer: a short warm-up the learner reads before pressing play, so they go in
 * oriented. Saved inside the lesson plan, so it works offline.
 */
export interface Primer {
  /** Two or three short lines on what the episode is about, in simple target-language words. */
  gist: string
  /** The same in the learner's own language, for beginners. */
  gistNative: string
  /** 5 to 8 words to listen for, in the order they first come up. */
  words: PrimerWord[]
  /** The episode's main themes, in the order they come up. */
  themes: PrimerTheme[]
}

export interface PrimerWord extends Term {
  /** When the host first says it. */
  at: number
  /** The host saying it, cut from the episode audio. */
  clip: Clip
}

export interface PrimerTheme {
  /** A few words, in the learner's language. */
  title: string
  /** Roughly when it first comes up. */
  at: number
}
