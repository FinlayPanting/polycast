/**
 * A short, in-memory log of what the player and the guide's voice did, for testing on a phone,
 * where console output doesn't reach the Mac. The test app can share it from the You tab.
 * Nothing leaves the phone unless the tester shares it, and it's cleared when the app closes.
 */
const MAX_LINES = 600
const lines: string[] = []
const started = Date.now()

export function plog(...parts: unknown[]): void {
  const text = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
  const line = `+${((Date.now() - started) / 1000).toFixed(2)}s ${text}`
  lines.push(line)
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[listen]', line)
}

export function playbackLog(): string {
  return lines.join('\n')
}
