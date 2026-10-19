/** A plan's price as the App Store gives it: the amount and its ISO currency code. */
export interface PlanPrice {
  amount: number
  currency: string
}

/** Used until the App Store's own prices arrive (spec: €4.99 a month or €39 a year). */
export const DEFAULT_MONTHLY: PlanPrice = { amount: 4.99, currency: 'EUR' }
export const DEFAULT_ANNUAL: PlanPrice = { amount: 39, currency: 'EUR' }

export function formatMoney(price: PlanPrice): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: price.currency }).format(price.amount)
  } catch {
    return `${price.amount.toFixed(2)} ${price.currency}`
  }
}

/**
 * The quiet line under the yearly price that does the sum for the learner, e.g.
 * "€3.25 a month, billed yearly: 35% less than monthly". Null when there's no honest saving to
 * show (prices missing, in different currencies, or the year not actually cheaper).
 */
export function yearlyValueLine(annual?: PlanPrice, monthly?: PlanPrice): string | null {
  if (!annual || !monthly || annual.currency !== monthly.currency) return null
  if (!(annual.amount > 0) || !(monthly.amount > 0)) return null
  const saving = Math.round((1 - annual.amount / (monthly.amount * 12)) * 100)
  if (saving < 1) return null
  const perMonth = formatMoney({ amount: Math.floor((annual.amount / 12) * 100) / 100, currency: annual.currency })
  return `${perMonth} a month, billed yearly: ${saving}% less than monthly`
}
