import { useEffect, useState } from 'react'
import { api } from './api'
import { worthShowing } from './translated'

/** Up to 40 titles go in one request; longer lists are cut there (the first screenful matters). */
export const TITLES_PER_REQUEST = 40

export interface Translated {
  titles: Map<string, string>
  podcastDescription?: string
  episodeDescription?: string
  /** Still waiting for the server. */
  pending: boolean
}

/**
 * Translations for a screen (PC-1017-T1): all its titles in one request, plus a show's or
 * episode's description. The originals show straight away; translations fill in when they arrive,
 * shared by everyone and cached on the server. Never throws: on a failure nothing extra shows.
 */
export function useTranslations(req: { titles?: string[]; podcastId?: string; episodeId?: string }, enabled = true): Translated {
  const titles = (req.titles ?? []).slice(0, TITLES_PER_REQUEST)
  const key = JSON.stringify([titles, req.podcastId, req.episodeId])
  const [state, setState] = useState<Translated>({ titles: new Map(), pending: false })
  useEffect(() => {
    if (!enabled || (titles.length === 0 && !req.podcastId && !req.episodeId)) return
    let live = true
    setState((s) => ({ ...s, pending: true }))
    api
      .translate({ titles, podcastId: req.podcastId, episodeId: req.episodeId })
      .then((r) => {
        if (!live) return
        const map = new Map<string, string>()
        titles.forEach((t, i) => {
          const tr = worthShowing(t, r.titles[i])
          if (tr) map.set(t, tr)
        })
        setState({ titles: map, podcastDescription: r.podcastDescription ?? undefined, episodeDescription: r.episodeDescription ?? undefined, pending: false })
      })
      .catch(() => live && setState((s) => ({ ...s, pending: false })))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return state
}
