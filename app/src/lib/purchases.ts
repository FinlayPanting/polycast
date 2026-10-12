import { Platform } from 'react-native'
import Purchases, { type PurchasesPackage } from 'react-native-purchases'
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

/** App Review requires a way to restore purchases on a new phone. */
export async function restore(): Promise<boolean> {
  if (!configured) return false
  const info = await Purchases.restorePurchases()
  return Boolean(info.entitlements.active[PLUS_ENTITLEMENT])
}
