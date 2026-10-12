import { addUsage, costUSD, ZERO_USAGE, type Usage } from '@polycast/core'

/** Where spending is recorded. The database implements this; tests use the in-memory one. */
export interface SpendLedger {
  /** US dollars spent and reserved today (UTC), across the whole service. */
  todayUSD(): Promise<number>
  /** Holds back an estimate before a call, so parallel jobs can't overshoot the cap together. */
  reserve(jobId: string, usd: number): Promise<void>
  /** Replaces a job's reservation with what it actually cost. */
  settle(jobId: string, usage: Usage): Promise<void>
}

export class SpendCapReached extends Error {
  constructor(readonly capUSD: number) {
    super(`Daily spending cap of $${capUSD} reached`)
    this.name = 'SpendCapReached'
  }
}

/** Enforces the hard daily spending cap (spec: Quality bar, Cost safety). */
export class SpendGuard {
  constructor(
    private readonly ledger: SpendLedger,
    readonly capUSD: number,
    private readonly onCapReached?: (capUSD: number) => void | Promise<void>,
  ) {}

  async reserve(jobId: string, estimateUSD: number): Promise<void> {
    const spent = await this.ledger.todayUSD()
    if (spent + estimateUSD > this.capUSD) {
      await this.onCapReached?.(this.capUSD)
      throw new SpendCapReached(this.capUSD)
    }
    await this.ledger.reserve(jobId, estimateUSD)
  }

  settle(jobId: string, usage: Usage): Promise<void> {
    return this.ledger.settle(jobId, usage)
  }
}

export function memoryLedger(): SpendLedger & { entries: Map<string, number> } {
  const entries = new Map<string, number>()
  return {
    entries,
    async todayUSD() {
      return [...entries.values()].reduce((a, b) => a + b, 0)
    },
    async reserve(jobId, usd) {
      entries.set(jobId, (entries.get(jobId) ?? 0) + usd)
    },
    async settle(jobId, usage) {
      entries.set(jobId, costUSD(usage))
    },
  }
}

/** Collects usage across a job's steps. */
export class UsageMeter {
  private total: Usage = ZERO_USAGE
  add(u: Partial<Usage>): void {
    this.total = addUsage(this.total, u)
  }
  get usage(): Usage {
    return this.total
  }
}
