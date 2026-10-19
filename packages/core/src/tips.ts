/**
 * "Support Polycast" tips (board item PC-1017-K3): three one-off consumable in-app purchases.
 * A tip unlocks nothing; it's a thank-you from learners who value the free route. Apple requires
 * tips inside an iPhone app to go through in-app purchase, so each size is an App Store product.
 */

export type TipSize = 'small' | 'medium' | 'large'

export interface Tip {
  size: TipSize
  /** The App Store product id (a Consumable in App Store Connect, imported into RevenueCat). */
  productId: string
  /** Shown until the App Store's own price arrives. */
  fallbackPrice: string
}

export const TIPS: readonly Tip[] = [
  { size: 'small', productId: 'com.finlaypanting.polycast.tip.small', fallbackPrice: '€1.99' },
  { size: 'medium', productId: 'com.finlaypanting.polycast.tip.medium', fallbackPrice: '€4.99' },
  { size: 'large', productId: 'com.finlaypanting.polycast.tip.large', fallbackPrice: '€9.99' },
]

export const TIP_PRODUCT_IDS: string[] = TIPS.map((t) => t.productId)

/** Whether an App Store product id is a tip, so a tip is never mistaken for Plus. */
export function isTipProduct(productId: unknown): boolean {
  return typeof productId === 'string' && TIP_PRODUCT_IDS.includes(productId)
}
