import { Platform } from 'react-native'
import { TIP_PRODUCT_IDS } from '@polycast/core'
import Purchases, { PRODUCT_CATEGORY, type PurchasesPackage, type PurchasesStoreProduct } from 'react-native-purchases'
import { config } from './config'

/** The entitlement RevenueCat grants for Plus; set up with this id in the RevenueCat dashboard. */
export const PLUS_ENTITLEMENT = 'plus'

let configured = false

/** Ties purchases to the Supabase user id, so the server's webhook knows whose plan to change. */
export function configurePurchases(userId: string): void {
  if (Platform.OS !== 'ios' || !config.revenueCatIosKey) return
  if (!configured) {
    Purchases.configure({ apiKey: config.revenueCatIosKey, appUserID: userId })
    configured = true
  } else void Purchases.logIn(userId)
}

export interface PlusOffer {
  monthly?: PurchasesPackage
  annual?: PurchasesPackage
}

export async function plusOffer(): Promise<PlusOffer> {
  if (!configured) return {}
  const offerings = await Purchases.getOfferings()
  const current = offerings.current
  return { monthly: current?.monthly ?? undefined, annual: current?.annual ?? undefined }
}

/** Buys Plus. Returns true when the learner now has it; false if they cancelled the sheet. */
export async function buy(pkg: PurchasesPackage): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg)
    return Boolean(customerInfo.entitlements.active[PLUS_ENTITLEMENT])
  } catch (e: any) {
    if (e?.userCancelled) return false
    throw new Error('The purchase didn’t go through. You haven’t been charged.')
  }
}

/**
 * App Review requires a way to restore purchases on a new phone. 'none' means the App Store answered
 * and there's no Plus on this Apple account; anything that stopped it answering (a dropped signal)
 * throws, so it's never mistaken for "nothing found".
 */
export async function restore(): Promise<'plus' | 'none'> {
  if (!configured) return 'none'
  const info = await Purchases.restorePurchases()
  return info.entitlements.active[PLUS_ENTITLEMENT] ? 'plus' : 'none'
}

/**
 * The tip products the App Store has for this device (PC-1017-K3), by product id. Empty when
 * purchases aren't set up here (the web preview, a build without the RevenueCat key).
 */
export async function tipProducts(): Promise<Map<string, PurchasesStoreProduct>> {
  if (!configured) return new Map()
  const products = await Purchases.getProducts(TIP_PRODUCT_IDS, PRODUCT_CATEGORY.NON_SUBSCRIPTION)
  return new Map(products.map((p) => [p.identifier, p]))
}

/** Leaves a tip. Returns true once Apple has taken it; false if they cancelled the sheet. */
export async function buyTip(product: PurchasesStoreProduct): Promise<boolean> {
  try {
    await Purchases.purchaseStoreProduct(product)
    return true
  } catch (e: any) {
    if (e?.userCancelled) return false
    throw e
  }
}
