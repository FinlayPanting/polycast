/**
 * Who may prepare a new episode, and what it is charged to (spec: Plans, pricing and running costs).
 * The server is the only place these decisions are enforced; the app uses them to explain limits.
 */

export const FREE_EPISODE_MAX_SEC = 2 * 60 * 60
export const FREE_COHORT_DEFAULT = 100
export const PLUS_MONTHLY_SEC = 5 * 60 * 60
export const FREE_GUIDED_EPISODES_PER_WEEK = 1

export type PlanName = 'free' | 'plus'

export interface AccountState {
  plan: PlanName
  /** Order in which the account signed up, starting at 1. */
  signupRank: number
  freeEpisodeUsed: boolean
  /** Seconds of new audio prepared on Plus in the current period. */
  plusUsedSec: number
}

export interface EpisodeState {
  durationSec: number
  /** Already in the shared catalogue: free for everyone. */
  ready: boolean
  /** Someone has already started preparing it. */
  preparing?: boolean
}

export interface ServiceState {
  /** How many accounts get the free episode; a server setting Finlay can raise. */
  freeCohortSize: number
  /** The hard daily spending cap has been hit. */
  spendCapReached: boolean
}

export type Charge = 'none' | 'freeEpisode' | 'plus'

export type Refusal =
  | 'service-paused'
  | 'plus-limit'
  | 'free-closed'
  | 'free-used'
  | 'too-long'

export type PrepDecision =
  | { allowed: true; charge: Charge }
  | { allowed: false; reason: Refusal }

export function isInFreeCohort(signupRank: number, cohortSize: number): boolean {
  return signupRank >= 1 && signupRank <= cohortSize
}

export function decidePreparation(account: AccountState, episode: EpisodeState, service: ServiceState): PrepDecision {
  // Ready or already on its way: costs nothing, so the free episode is never used up on it.
  if (episode.ready || episode.preparing) return { allowed: true, charge: 'none' }
  if (service.spendCapReached) return { allowed: false, reason: 'service-paused' }

  if (account.plan === 'plus') {
    if (account.plusUsedSec + episode.durationSec > PLUS_MONTHLY_SEC) return { allowed: false, reason: 'plus-limit' }
    return { allowed: true, charge: 'plus' }
  }

  if (!isInFreeCohort(account.signupRank, service.freeCohortSize)) return { allowed: false, reason: 'free-closed' }
  if (account.freeEpisodeUsed) return { allowed: false, reason: 'free-used' }
  if (episode.durationSec > FREE_EPISODE_MAX_SEC) return { allowed: false, reason: 'too-long' }
  return { allowed: true, charge: 'freeEpisode' }
}

/** Plain-English explanation shown to the learner for each refusal. */
export const REFUSAL_MESSAGES: Record<Refusal, string> = {
  'service-paused': 'New episodes are paused for today. Everything that’s ready still plays.',
  'plus-limit': 'You’ve used this month’s 5 hours of new episodes. Ready episodes still play.',
  'free-closed': 'Free new episodes have all been claimed. Ready episodes are free to play, or try Plus.',
  'free-used': 'You’ve used your free episode. Ready episodes are free to play, or try Plus for more.',
  'too-long': 'Your free episode can be up to 2 hours. Pick a shorter one, or try Plus.',
}

/** Free learners hear the guide on one ready episode a week. */
export function mayUseGuide(plan: PlanName, guidedEpisodesThisWeek: number, alreadyGuidedThisEpisode: boolean): boolean {
  if (plan === 'plus' || alreadyGuidedThisEpisode) return true
  return guidedEpisodesThisWeek < FREE_GUIDED_EPISODES_PER_WEEK
}

/** Start of the ISO week (Monday 00:00 UTC) containing a date, for counting guided episodes. */
export function weekStartUTC(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d
}

/** Free-cohort alerts Finlay receives as free episodes are claimed. */
export function cohortAlert(claimedBefore: number, claimedAfter: number, thresholds = [50, 90, 100]): number | undefined {
  return thresholds.find((t) => claimedBefore < t && claimedAfter >= t)
}
