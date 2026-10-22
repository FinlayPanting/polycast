import { PolycastLiveActivity } from '../../modules/polycast-live-activity'
import type { LiveLine } from './liveLine'
import { plog } from './playbackLog'

/**
 * Sends lines to the lock-screen Live Activity (PC-1020-L1) and logs each update with how long iOS
 * took to accept it, so a 10-minute locked listen shows whether updates keep coming. Quietly does
 * nothing on the web preview, older builds, or if Live Activities are switched off.
 */
export const liveActivityAvailable = (): boolean => {
  try {
    return PolycastLiveActivity?.isAvailable() ?? false
  } catch {
    return false
  }
}

export function sendLiveLine(show: string, l: LiveLine): void {
  const m = PolycastLiveActivity
  if (!m) return
  const sentAt = Date.now()
  plog(`live activity: line ${l.index} sent`)
  m.show({ show, line: l.line, english: l.english, next: l.next, startMs: l.startMs, endMs: l.endMs }).then(
    (ok) => plog(`live activity: line ${l.index} ${ok ? 'accepted' : 'refused'} after ${Date.now() - sentAt} ms`),
    (e) => plog(`live activity: line ${l.index} failed: ${String(e)}`),
  )
}

export function endLiveLine(): void {
  const m = PolycastLiveActivity
  if (!m) return
  plog('live activity: ended')
  void m.end().catch(() => {})
}
