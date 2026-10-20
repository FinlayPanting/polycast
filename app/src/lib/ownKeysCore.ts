/** Both keys, or nothing: preparation on own keys needs ElevenLabs and Google together (PC-1017-K1). */
export interface OwnKeys {
  elevenlabs: string
  gemini: string
}

export function ownKeysFrom(elevenlabs: string | null | undefined, gemini: string | null | undefined): OwnKeys | undefined {
  const e = elevenlabs?.trim()
  const g = gemini?.trim()
  return e && g ? { elevenlabs: e, gemini: g } : undefined
}

/** What the episode screen says about the cost of preparing, on the learner's own keys. */
export const OWN_KEYS_COST_LINE = 'Prepared on your own API keys, so it doesn’t use any allowance. Once it’s ready, it’s free for everyone learning this language.'

/** The prepare screen's line while a free Google key's rate limit slows things down. */
export const SLOW_KEY_LINE = 'Your free Google key is slowing this down'

/** "$0.35" for an estimate already rounded to 5 cents. */
export const dollars = (usd: number) => `$${usd.toFixed(2)}`

/** The cost estimate by the prepare button (PC-1017-K4); always an estimate. */
export function estimateLine(totalUSD: number): string {
  return `About ${dollars(totalUSD)} on your keys`
}

/** The split, shown on tap: whose account pays for what. */
export function estimateSplit(e: { elevenlabsUSD: number; googleUSD: number }): string[] {
  return [`ElevenLabs, for the subtitles and voices: about ${dollars(e.elevenlabsUSD)}`, `Google, for the lessons: about ${dollars(e.googleUSD)}`]
}

/** On a ready episode: someone already prepared it, so it costs the learner nothing. */
export const ALREADY_PREPARED_LINE = 'Free, already prepared'

/** After preparing on their keys: what it actually used, at the providers' list prices. */
export function usedLine(usd: number): string {
  return `Used about ${dollars(usd < 0.05 ? 0.05 : Math.round(usd * 20) / 20)} on your keys`
}
