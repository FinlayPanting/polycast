/**
 * Waits for a value to stop changing before passing it on (PC-1019-06): search results change
 * while the learner types, and each new list would otherwise cost a translation request. `flush`
 * passes the latest value on at once (the search key was pressed).
 */
export const SEARCH_TRANSLATE_SETTLE_MS = 1500

export interface Timers {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }

export function settler<T>(onSettle: (value: T) => void, ms = SEARCH_TRANSLATE_SETTLE_MS, timers: Timers = realTimers) {
  let handle: unknown
  let latest: { value: T } | undefined
  const fire = () => {
    handle = undefined
    if (latest) onSettle(latest.value)
    latest = undefined
  }
  return {
    update(value: T) {
      latest = { value }
      if (handle !== undefined) timers.clear(handle)
      handle = timers.set(fire, ms)
    },
    flush() {
      if (handle !== undefined) timers.clear(handle)
      fire()
    },
    cancel() {
      if (handle !== undefined) timers.clear(handle)
      handle = undefined
      latest = undefined
    },
  }
}
