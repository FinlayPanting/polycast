import { PLUS_MONTHLY_SEC } from '@polycast/core'
import type { NewEpisode } from './libraryCore'

/**
 * Auto-download for followed shows (PC-1017-F12). Pure rules here so they can be tested; the
 * phone-side work lives in autoDownload.ts.
 *
 * A show is on only when the learner turns it on (default off). From then, each new episode of it
 * downloads on its own when the Library checks for new episodes: on Wi-Fi only unless they allow
 * mobile data. An episode that isn't ready yet is prepared first, but only for Plus, within the
 * month's Plus hours; the free episode and own keys are never spent on their own.
 */

export interface AutoShow {
  podcastId: string
  /** When it was turned on: only episodes published after this download on their own. */
  since: string
}

export const autoShowId = (s: AutoShow) => s.podcastId

export type Connection = 'wifi' | 'cellular' | 'none' | 'unknown'

/** A few at a time, so one Library visit never fills the phone or the queue. */
export const AUTO_DOWNLOAD_MAX = 3

export interface AutoDownloadInput {
  episodes: readonly NewEpisode[]
  shows: readonly AutoShow[]
  /** Episodes already on the phone. */
  saved: ReadonlySet<string>
  /** Episodes this phone has already asked to prepare. */
  askedToPrepare: ReadonlySet<string>
  connection: Connection
  allowMobileData: boolean
  account: { plan: 'free' | 'plus'; plusUsedSec: number } | null
  max?: number
}

export interface AutoDownloadPlan {
  download: NewEpisode[]
  prepare: NewEpisode[]
}

export function connectionAllows(connection: Connection, allowMobileData: boolean): boolean {
  return connection === 'wifi' || (connection === 'cellular' && allowMobileData)
}

export function autoDownloadPlan(input: AutoDownloadInput): AutoDownloadPlan {
  const plan: AutoDownloadPlan = { download: [], prepare: [] }
  if (!connectionAllows(input.connection, input.allowMobileData)) return plan
  const since = new Map(input.shows.map((s) => [s.podcastId, Date.parse(s.since)]))
  const max = input.max ?? AUTO_DOWNLOAD_MAX
  let plusLeft = input.account?.plan === 'plus' ? PLUS_MONTHLY_SEC - input.account.plusUsedSec : 0
  // Oldest first, so a backlog fills in the order it was published.
  const candidates = [...input.episodes]
    .filter((e) => {
      const from = since.get(e.podcastId)
      return from !== undefined && Number.isFinite(from) && Date.parse(e.published) >= from && !input.saved.has(e.episodeId)
    })
    .sort((a, b) => a.published.localeCompare(b.published))
  for (const e of candidates) {
    if (plan.download.length + plan.prepare.length >= max) break
    if (e.ready) plan.download.push(e)
    else if (!input.askedToPrepare.has(e.episodeId) && e.durationSec > 0 && e.durationSec <= plusLeft) {
      plan.prepare.push(e)
      plusLeft -= e.durationSec
    }
  }
  return plan
}

/** The show page's switch label, and what VoiceOver reads. */
export const AUTO_DOWNLOAD_LABEL = 'Download new episodes'
export function autoDownloadHint(plan: 'free' | 'plus' | undefined, allowMobileData: boolean): string {
  const where = allowMobileData ? 'on Wi-Fi or mobile data' : 'on Wi-Fi'
  return plan === 'plus'
    ? `New episodes download ${where} when you open your Library. Ones that aren’t ready yet are prepared from your Plus hours.`
    : `New episodes download ${where} when you open your Library, once they’re ready.`
}
