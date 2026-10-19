import { TIPS, type Tip } from '@polycast/core'

/** The words on the Support Polycast screen (PC-1017-K3). Warm and plain; never a nag. */
export const TIP_COPY = {
  title: 'Support Polycast',
  intro:
    'Polycast is made by one person, and every episode anyone prepares stays free for everyone. If it’s helping your listening, a tip goes towards the time and the running costs behind it.',
  noUnlock: 'A tip is a one-off thank-you. It doesn’t unlock anything, and Polycast works the same without one.',
  thanksTitle: 'Thank you',
  thanksBody: 'That really helps. Enjoy your next listen.',
  unavailable: 'Tips aren’t available on this device yet.',
}

export interface TipOption {
  tip: Tip
  /** What the button says, e.g. "€4.99 tip". */
  label: string
  /** False until the App Store has answered with this product. */
  available: boolean
}

/**
 * The three tip buttons, smallest first, using the App Store's prices where it has given them
 * (`prices` maps product id → localised price string) and the euro price otherwise.
 */
export function tipOptions(prices: ReadonlyMap<string, string> | undefined): TipOption[] {
  return TIPS.map((tip) => {
    const price = prices?.get(tip.productId)
    return { tip, label: `${price ?? tip.fallbackPrice} tip`, available: Boolean(price) }
  })
}

export const TIP_ERRORS = {
  offline: 'Couldn’t reach the App Store. Check your connection and try again.',
  failed: 'The tip didn’t go through. You haven’t been charged.',
}

/** What to say when a tip purchase throws (a cancelled sheet never gets here). */
export function tipErrorMessage(e: unknown): string {
  const code = String((e as { code?: unknown })?.code ?? '')
  const text = `${code} ${e instanceof Error ? e.message : String(e ?? '')}`.toLowerCase()
  if (/network|offline|internet|connection|timed out|timeout/.test(text)) return TIP_ERRORS.offline
  return TIP_ERRORS.failed
}
