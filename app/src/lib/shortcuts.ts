import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { PolycastShortcuts } from '../../modules/polycast-shortcuts'
import { LAST_PLAYED_KEY, parseLastPlayed } from '../player/session'
import { api } from './api'
import { followedShows } from './keptList'
import { plog } from './playbackLog'
import { continueRoute, newestEpisodeRoute, parseShortcut, shortcutShows, type ShortcutAction, type ShortcutRoute } from './shortcutsCore'

async function routeFor(action: ShortcutAction): Promise<ShortcutRoute> {
  if (action.kind === 'continue') return continueRoute(parseLastPlayed(await AsyncStorage.getItem(LAST_PLAYED_KEY).catch(() => null)))
  try {
    const page = await api.openShow({ podcastId: action.podcastId })
    return newestEpisodeRoute(action.podcastId, page.episodes)
  } catch {
    return { pathname: '/show', params: { podcastId: action.podcastId } }
  }
}

/**
 * Siri and Spotlight shortcuts (PC-1021-09): keeps the followed shows the shortcut offers up to
 * date, and opens the right screen when one is run (as the app opens, or while it's open).
 * Does nothing on the web preview or builds without the shortcuts.
 */
export function useShortcuts(enabled: boolean): void {
  useEffect(() => {
    const m = PolycastShortcuts
    if (!m || !enabled) return
    const sync = () => {
      try {
        m.setShows(shortcutShows(followedShows.current()))
      } catch {
        // Shortcuts are a nicety: never let them get in the way.
      }
    }
    void followedShows.load().then(sync)
    const offShows = followedShows.subscribe(sync)
    const handle = () => {
      let action: ShortcutAction | undefined
      try {
        action = parseShortcut(m.takePending())
      } catch {
        return
      }
      if (!action) return
      plog(`shortcut: ${action.kind}`)
      void routeFor(action).then((r) => router.push(r as never))
    }
    handle()
    const sub = m.addListener('onShortcut', handle)
    const app = AppState.addEventListener('change', (s) => s === 'active' && handle())
    return () => {
      offShows()
      sub.remove()
      app.remove()
    }
  }, [enabled])
}
