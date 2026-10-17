/**
 * Plus the moment it's paid for (board item PC-1017-01). Plus only switches on in Polycast's
 * database when RevenueCat's message reaches the server, which can take a few seconds after the App
 * Store says yes. In that gap the app trusts the App Store's answer for a short while and keeps
 * checking until the server agrees.
 */

/** How long the App Store's word stands in for the server's. */
export const PENDING_PLUS_MS = 10 * 60_000
/** How often, and how many times, the app asks the server again. */
export const PLUS_CHECK_EVERY_MS = 3000
export const PLUS_CHECK_TRIES = 20

/** The profile as the app should show it: Plus while the App Store's confirmation is fresh. */
export function withPendingPlus<P extends { plan: 'free' | 'plus' }>(profile: P | null, pendingUntil: number | undefined, now = Date.now()): P | null {
  if (!profile || profile.plan === 'plus' || !pendingUntil || now >= pendingUntil) return profile
  return { ...profile, plan: 'plus' }
}

/** Asks the server again until it says Plus (true) or the tries run out (false). Errors count as "not yet". */
export async function waitForServerPlus(
  loadPlan: () => Promise<'free' | 'plus' | undefined>,
  opts: { tries?: number; everyMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const tries = opts.tries ?? PLUS_CHECK_TRIES
  for (let i = 0; i < tries; i++) {
    if ((await loadPlan().catch(() => undefined)) === 'plus') return true
    if (i < tries - 1) await sleep(opts.everyMs ?? PLUS_CHECK_EVERY_MS)
  }
  return false
}

export const RESTORE_MESSAGES = {
  none: 'No Plus subscription found for this Apple account.',
  offline: 'Couldn’t reach the App Store. Check your connection and try again.',
  failed: 'Restoring didn’t work just now. Please try again in a moment.',
}

/** What to say when restoring throws: a dropped signal is never "nothing found". */
export function restoreErrorMessage(e: unknown): string {
  const code = String((e as { code?: unknown })?.code ?? '')
  const text = `${code} ${e instanceof Error ? e.message : String(e ?? '')}`.toLowerCase()
  if (/network|offline|internet|connection|timed out|timeout/.test(text)) return RESTORE_MESSAGES.offline
  return RESTORE_MESSAGES.failed
}
