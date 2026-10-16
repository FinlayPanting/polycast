import { PLUS_MONTHLY_SEC } from '@polycast/core'

/**
 * The calm card under the wrap-up of a learner's free episode: what they got out of it, then what
 * Plus offers. No countdowns, no pressure. Undefined when it isn't their free episode.
 */
export function plusInvite(freeEpisode: boolean | undefined, listenedSec: number, wordsKept: number): { summary: string; offer: string } | undefined {
  if (!freeEpisode) return undefined
  const mins = Math.max(1, Math.round(listenedSec / 60))
  const listened = `You listened for ${mins} ${mins === 1 ? 'minute' : 'minutes'}`
  const words = wordsKept === 0 ? '' : ` and kept ${wordsKept} ${wordsKept === 1 ? 'word' : 'words'}`
  return { summary: `${listened}${words}.`, offer: `Keep going with Plus: ${PLUS_MONTHLY_SEC / 3600} hours a month` }
}
