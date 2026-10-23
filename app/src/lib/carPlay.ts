import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useEffect } from 'react'
import { PolycastCarPlay } from '../../modules/polycast-carplay'
import { LAST_PLAYED_KEY, parseLastPlayed } from '../player/session'
import { api } from './api'
import { CARPLAY_EMPTY, carPlayItems, carPlayShowOutcome, type CarPlayOutcome } from './carPlayCore'
import { followedShows } from './keptList'
import { plog } from './playbackLog'
import { continueRoute, parseShortcut } from './shortcutsCore'

async function lastPlayed() {
  return parseLastPlayed(await AsyncStorage.getItem(LAST_PLAYED_KEY).catch(() => null))
}

async function outcomeFor(id: string): Promise<CarPlayOutcome | undefined> {
  const action = parseShortcut(id)
  if (!action) return undefined
  if (action.kind === 'continue') {
    const last = await lastPlayed()
    return last ? { play: continueRoute(last) } : undefined
  }
  try {
    const page = await api.openShow({ podcastId: action.podcastId })
    return carPlayShowOutcome(action.podcastId, page.episodes)
  } catch {
    return { message: 'Polycast can’t reach the internet just now. Downloaded episodes still play from Carry on.' }
  }
}

/**
 * CarPlay (PC-1022-10): keeps the car's list (Carry on, followed shows) up to date and starts the
 * listen on the phone when something is picked in the car, as the Siri shortcuts do. Does nothing
 * on the web preview or in builds without CarPlay.
 */
export function useCarPlay(enabled: boolean): void {
  useEffect(() => {
    const m = PolycastCarPlay
    if (!m || !enabled) return
    let live = true
    const sync = async () => {
      const last = await lastPlayed()
      if (!live) return
      try {
        m.setItems(carPlayItems(last, followedShows.current()), CARPLAY_EMPTY)
      } catch {
        // CarPlay is a nicety: never let it get in the way.
      }
    }
    void followedShows.load().then(sync)
    const offShows = followedShows.subscribe(() => void sync())
    // Carry on changes as episodes are played; a light refresh keeps its line current.
    const timer = setInterval(() => void sync(), 60_000)
    const sub = m.addListener('onSelect', ({ id }) => {
      plog(`carplay: ${id}`)
      void outcomeFor(id).then((o) => {
        if (!o) return
        if ('message' in o) m.showMessage(o.message)
        else router.push(o.play as never)
      })
    })
    return () => {
      live = false
      offShows()
      clearInterval(timer)
      sub.remove()
    }
  }, [enabled])
}
