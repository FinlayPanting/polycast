/**
 * The player's More menu (PC-1017-F06): quieter things that don't belong among the main controls.
 * Listed in order, with Cancel last for the iPhone action sheet.
 */
export type PlayerMenuAction = 'replayIntro' | 'lineByLine' | 'reportLine'

const LABELS: Record<PlayerMenuAction, (o: { lineByLine: boolean }) => string> = {
  replayIntro: () => 'Listen to the intro again',
  // Line by line (PC-1018-07): pause after each subtitle line.
  lineByLine: ({ lineByLine }) => (lineByLine ? 'Turn off Line by line' : 'Line by line: pause after each line'),
  // 'That looks wrong' (PC-1018-04): flag the line on screen, or its translation.
  reportLine: () => 'That line looks wrong',
}

/** What a learner sees after reporting a line. */
export const REPORT_THANKS = 'Thanks, we’ll take a look.'
export const REPORT_FAILED = 'That didn’t send. Please try again in a moment.'

export function playerMenu({ hasIntro, guideSpeaking, lineByLine = false, lineOnScreen = false }: { hasIntro: boolean; guideSpeaking: boolean; lineByLine?: boolean; lineOnScreen?: boolean }): { actions: PlayerMenuAction[]; options: string[]; cancelIndex: number } {
  const actions: PlayerMenuAction[] = []
  // Not while the guide is mid-sentence: the intro would cut across them.
  if (hasIntro && !guideSpeaking) actions.push('replayIntro')
  actions.push('lineByLine')
  // Only with a subtitle line showing, so it's clear which line is meant.
  if (lineOnScreen) actions.push('reportLine')
  const options = [...actions.map((a) => LABELS[a]({ lineByLine })), 'Cancel']
  return { actions, options, cancelIndex: options.length - 1 }
}
