/** Lower-cases a token for matching and strips surrounding punctuation, keeping letters with accents. */
export function normalizeToken(token: string, language?: string): string {
  return token
    .normalize('NFC')
    .toLocaleLowerCase(language)
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
}

/** Splits a phrase into normalised tokens. */
export function tokenize(phrase: string, language?: string): string[] {
  return phrase
    .split(/\s+/)
    .map((t) => normalizeToken(t, language))
    .filter((t) => t.length > 0)
}

/** True when a word ends a sentence. */
export function endsSentence(token: string): boolean {
  return /[.!?…]["»”’)]*$/u.test(token.trim())
}
