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
