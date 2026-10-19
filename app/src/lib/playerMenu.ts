/**
 * The player's More menu (PC-1017-F06): quieter things that don't belong among the main controls.
 * Listed in order, with Cancel last for the iPhone action sheet.
 */
export type PlayerMenuAction = 'replayIntro'

const LABELS: Record<PlayerMenuAction, string> = {
  replayIntro: 'Listen to the intro again',
}

export function playerMenu({ hasIntro, guideSpeaking }: { hasIntro: boolean; guideSpeaking: boolean }): { actions: PlayerMenuAction[]; options: string[]; cancelIndex: number } {
  const actions: PlayerMenuAction[] = []
  // Not while the guide is mid-sentence: the intro would cut across them.
  if (hasIntro && !guideSpeaking) actions.push('replayIntro')
  const options = [...actions.map((a) => LABELS[a]), 'Cancel']
  return { actions, options, cancelIndex: options.length - 1 }
}
