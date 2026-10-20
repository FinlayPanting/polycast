/**
 * The player's More menu (PC-1017-F06): quieter things that don't belong among the main controls.
 * Listed in order, with Cancel last for the iPhone action sheet.
 */
export type PlayerMenuAction = 'replayIntro' | 'lineByLine'

const LABELS: Record<PlayerMenuAction, (o: { lineByLine: boolean }) => string> = {
  replayIntro: () => 'Listen to the intro again',
  // Line by line (PC-1018-07): pause after each subtitle line.
  lineByLine: ({ lineByLine }) => (lineByLine ? 'Turn off Line by line' : 'Line by line: pause after each line'),
}

export function playerMenu({ hasIntro, guideSpeaking, lineByLine = false }: { hasIntro: boolean; guideSpeaking: boolean; lineByLine?: boolean }): { actions: PlayerMenuAction[]; options: string[]; cancelIndex: number } {
  const actions: PlayerMenuAction[] = []
  // Not while the guide is mid-sentence: the intro would cut across them.
  if (hasIntro && !guideSpeaking) actions.push('replayIntro')
  actions.push('lineByLine')
  const options = [...actions.map((a) => LABELS[a]({ lineByLine })), 'Cancel']
  return { actions, options, cancelIndex: options.length - 1 }
}
