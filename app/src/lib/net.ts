/**
 * Small network helpers with no app dependencies, so they can be tested on their own.
 */

/** How long the app waits for the Polycast server before giving up. */
export const REQUEST_TIMEOUT_MS = 10_000

export class TimeoutError extends Error {
  constructor() {
    super('Polycast didn’t answer in time. Check your connection and try again.')
    this.name = 'TimeoutError'
  }
}

/** fetch with a time limit: a weak connection fails after `ms` instead of hanging. */
export async function fetchWithTimeout(f: typeof fetch, url: string, init: RequestInit = {}, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), ms)
  try {
    return await f(url, { ...init, signal: abort.signal })
  } catch (e) {
    if (abort.signal.aborted) throw new TimeoutError()
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Whether a failed request means "no signal" (or the server is away), so a copy saved on the phone
 * should play instead. A clear answer from the server, such as "this show was removed" or "not
 * allowed", is not: the learner should see it.
 */
export function isOfflineError(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status
  if (typeof status === 'number') return status >= 500
  return true
}

const STORED = 'polycast-episodes:'
const trim = (s: string) => s.replace(/^file:\/\//, '').replace(/\/+$/, '')

/**
 * How a file in the downloads folder is remembered: relative to that folder. iOS moves an app's
 * folder on every update, so a full path saved before an update points nowhere after it.
 */
export function toStoredPath(uri: string, folderUri: string): string {
  const base = trim(folderUri)
  const path = trim(uri)
  return path.startsWith(base + '/') ? STORED + path.slice(base.length + 1) : uri
}

/**
 * The file's current address. Also rescues lessons saved by older builds with a full path: anything
 * inside a ".../Documents/episodes/" folder is moved onto today's folder.
 */
export function fromStoredPath(stored: string, folderUri: string): string {
  const base = folderUri.replace(/\/+$/, '')
  if (stored.startsWith(STORED)) return `${base}/${stored.slice(STORED.length)}`
  if (/^https?:/i.test(stored)) return stored
  const old = stored.match(/\/Documents\/episodes\/(.+)$/)
  return old ? `${base}/${old[1]}` : stored
}

/** A request's route for the log, without its query or ids: "/v1/episodes/:id/listen". */
export function apiRoute(path: string): string {
  return path
    .split('?')[0]!
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
}
