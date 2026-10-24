/**
 * The Plus screen starts with what the learner already has (PC-1023-03): their own saved words and the
 * episodes they've finished with their guide, before the list of what Plus adds. Asking someone to keep
 * going with something that's already theirs is warmer than a feature list. Nothing yet: no line.
 */
export interface PlusOpenerStats {
  /** Words saved in the language being learned. */
  words?: number
  /** Guided listens finished, any language. */
  finished?: number
  languageName: string
  guideName: string
}

export function plusOpener({ words = 0, finished = 0, languageName, guideName }: PlusOpenerStats): string | undefined {
  const w = words > 0 ? `saved ${words} ${languageName} ${words === 1 ? 'word' : 'words'}` : ''
  const f = finished > 0 ? `finished ${finished === 1 ? 'an episode' : `${finished} episodes`} with ${guideName}` : ''
  if (w && f) return `You’ve ${w} and ${f}.`
  if (w) return `You’ve ${w} so far.`
  if (f) return `You’ve ${f}.`
  return undefined
}

/** The line that leads into the list once there's something of theirs to keep going with. */
export const PLUS_KEEP_GOING = 'Plus keeps it going:'
