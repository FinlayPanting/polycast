/**
 * What's new (PC-1019-F02): a change log of what each overnight build changed, served by the server
 * from server/changelog.json so it updates with every push, without a new App Store build.
 */

export type ChangelogKind = 'Feature' | 'UX' | 'Growth' | 'Content' | 'Bug' | 'Refinement' | 'Security'

export interface ChangelogEntry {
  /** The board card, e.g. PC-1017-F10. */
  id: string
  /** The build date, YYYY-MM-DD. */
  date: string
  title: string
  /** One plain-English line on what changed. */
  description: string
  /** Where in the app to try it. */
  tryIt?: string
  kind: ChangelogKind
}

export interface ChangelogBuild {
  date: string
  /** "Overnight build, Tue 20 Oct" */
  label: string
  /** New features and changes you can see, first. */
  features: ChangelogEntry[]
  /** Bug fixes and refinements, under a smaller heading. */
  fixes: ChangelogEntry[]
}

const FIX_KINDS = new Set<ChangelogKind>(['Bug', 'Refinement', 'Security'])
const KINDS = new Set<ChangelogKind>(['Feature', 'UX', 'Growth', 'Content', 'Bug', 'Refinement', 'Security'])
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Overnight build, Tue 20 Oct", from "2026-10-20". */
export function buildLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return 'Overnight build'
  return `Overnight build, ${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** Entries read back safely: anything malformed is left out rather than breaking the screen. */
export function parseChangelog(json: unknown): ChangelogEntry[] {
  const list = (json as { entries?: unknown })?.entries
  if (!Array.isArray(list)) return []
  return list.filter(
    (e): e is ChangelogEntry =>
      Boolean(e) &&
      typeof e.id === 'string' &&
      typeof e.title === 'string' &&
      typeof e.description === 'string' &&
      typeof e.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
      KINDS.has(e.kind) &&
      (e.tryIt === undefined || typeof e.tryIt === 'string'),
  )
}

/** Newest build first; within a build, features then fixes, each in the order they shipped. */
export function groupChangelog(entries: readonly ChangelogEntry[]): ChangelogBuild[] {
  const byDate = new Map<string, ChangelogBuild>()
  for (const e of entries) {
    let b = byDate.get(e.date)
    if (!b) byDate.set(e.date, (b = { date: e.date, label: buildLabel(e.date), features: [], fixes: [] }))
    ;(FIX_KINDS.has(e.kind) ? b.fixes : b.features).push(e)
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
}

/** The orange dot: entries from a build newer than the one the learner last saw. */
export function hasUnread(entries: readonly ChangelogEntry[], lastSeenDate: string | undefined): boolean {
  if (!entries.length) return false
  const newest = entries.reduce((m, e) => (e.date > m ? e.date : m), '')
  return !lastSeenDate || newest > lastSeenDate
}

/** The newest build date, remembered when the learner opens What's new. */
export function newestDate(entries: readonly ChangelogEntry[]): string | undefined {
  return entries.reduce<string | undefined>((m, e) => (!m || e.date > m ? e.date : m), undefined)
}
