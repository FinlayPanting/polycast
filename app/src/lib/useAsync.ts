import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from './config'
import { ScreenCache } from './screenCache'

/** Shared by every screen: their last answers, so going back to one is instant (PC-1017-F03). */
export const screenCache = new ScreenCache(config.demo ? undefined : AsyncStorage)

/**
 * Loads data for a screen, with a reload for pull-to-refresh and retry buttons. With `cacheKey`,
 * the screen's last answer shows at once while a fresh one loads; a failed refresh keeps it on
 * screen rather than swapping it for an error.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], opts: { cacheKey?: string } = {}): { data?: T; error?: string; loading: boolean; reload: () => Promise<void> } {
  const { cacheKey } = opts
  const [data, setData] = useState<T | undefined>(() => (cacheKey ? screenCache.peek<T>(cacheKey) : undefined))
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const latest = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)

  const reload = useCallback(async () => {
    const id = ++latest.current
    setLoading(true)
    setError(undefined)
    if (cacheKey) {
      const kept = await screenCache.get<T>(cacheKey)
      if (id === latest.current) setData(kept)
    }
    try {
      const d = await run()
      if (id === latest.current) setData(d)
      if (cacheKey) screenCache.set(cacheKey, d)
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }, [run, cacheKey])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, loading, reload }
}
