/**
 * Your first saved word blooms (PC-1018-06): the very first time a learner saves a word, the Polycast
 * mark's coral, magenta and violet stems slide out under the save button with a line naming the
 * language. Once only. Pure rules here; storage in firstWord.ts.
 */

export const FIRST_WORD_KEY = 'polycast.firstWordBloom.v1'

/**
 * Whether this save is the learner's first: not celebrated on this phone before, and the word just
 * saved is the only one they have in this language (so someone who saved words before this shipped
 * isn't told this one is their first).
 */
export function isFirstWord(opts: { celebrated: boolean; wordsInLanguage: number }): boolean {
  return !opts.celebrated && opts.wordsInLanguage <= 1
}

export function firstWordLine(languageName: string): string {
  return `Your first word in ${languageName}.`
}
