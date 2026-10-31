/**
 * You're not listening alone (PC-1030-09): on the wrap-up, one quiet line when at least ten other learners
 * finished the same episode in the last seven days. Counts only, never names; below ten the server sends
 * nothing, so small numbers that could point at a person are never shown.
 */
export const COMPANY_MIN = 10
export const COMPANY_DAYS = 7

/** What the server sends: the count, or null below the threshold. */
export function companyCount(others: number): number | null {
  return Number.isInteger(others) && others >= COMPANY_MIN ? others : null
}

export function companyLine(others: number | null | undefined): string | undefined {
  return typeof others === 'number' && others >= COMPANY_MIN ? `${others.toLocaleString('en-GB')} other learners heard this one this week.` : undefined
}
