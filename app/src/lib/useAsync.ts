import { useCallback, useEffect, useRef, useState } from 'react'

/** Loads data for a screen, with a reload for pull-to-refresh and retry buttons. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): { data?: T; error?: string; loading: boolean; reload: () => Promise<void> } {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const latest = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)

  const reload = useCallback(async () => {
    const id = ++latest.current
    setLoading(true)
    setError(undefined)
    try {
      const d = await run()
      if (id === latest.current) setData(d)
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }, [run])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, loading, reload }
}
