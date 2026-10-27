import type { KnownWordsAnswer } from './api'

/**
 * "You already know these words" (PC-1022-08): the step between picking a language and the rest of
 * onboarding. Shown only when the server found at least three words; otherwise onboarding carries
 * straight on, so a slow or empty answer never holds anyone up.
 */
export const KNOWN_WORDS_MIN = 3

export function shouldShowKnownWords(a: KnownWordsAnswer | undefined): a is KnownWordsAnswer & { audioUrl: string } {
  return Boolean(a && a.audioUrl && a.words.length >= KNOWN_WORDS_MIN)
}

export function knownWordsHeading(languageName: string): string {
  return `You already know some ${languageName}`
}

export function knownWordsIntro(podcastTitle: string | undefined): string {
  return podcastTitle
    ? `These come up in ${podcastTitle}, one of the first shows you could hear. Tap a word to hear the host say it.`
    : 'These come up in one of the first episodes you could hear. Tap a word to hear the host say it.'
}
