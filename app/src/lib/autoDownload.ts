import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Network from 'expo-network'
import { useEffect, useState } from 'react'
import { api } from './api'
import { autoDownloadPlan, autoShowId, type AutoShow, type Connection } from './autoDownloadCore'
import { KeptList } from './keptList'
import type { NewEpisode } from './libraryCore'
import { downloadForOffline, isSavedForOffline } from './offline'
import { plog } from './playbackLog'

/** Followed shows with auto-download on (PC-1017-F12). Kept on the phone, like follows. */
export const autoDownloadShows = new KeptList<AutoShow>('polycast.autoDownload.v1', autoShowId)

const MOBILE_DATA_KEY = 'polycast.autoDownload.mobileData.v1'
const ASKED_KEY = 'polycast.autoDownload.asked.v1'
const ASKED_MAX = 200
const HANDLED_KEY = 'polycast.autoDownload.handled.v1'
const HANDLED_MAX = 300

async function readList(key: string): Promise<string[]> {
  try {
    const v: unknown = JSON.parse((await AsyncStorage.getItem(key)) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Remembers an episode auto-download must leave alone from now on: one it saved, or one the
 * learner removed (PC-1021-02). Newest first, the oldest dropped after 300; auto-download only
 * looks back two weeks, so that's plenty.
 */
export async function rememberHandled(episodeId: string): Promise<void> {
  const list = (await readList(HANDLED_KEY)).filter((id) => id !== episodeId)
  list.unshift(episodeId)
  await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify(list.slice(0, HANDLED_MAX))).catch(() => {})
}

let mobileData: boolean | undefined
const mobileDataListeners = new Set<(v: boolean) => void>()

export async function allowsMobileData(): Promise<boolean> {
  if (mobileData === undefined) mobileData = (await AsyncStorage.getItem(MOBILE_DATA_KEY).catch(() => null)) === '1'
  return mobileData
}

export function setAllowsMobileData(v: boolean): void {
  mobileData = v
  void AsyncStorage.setItem(MOBILE_DATA_KEY, v ? '1' : '0').catch(() => {})
  mobileDataListeners.forEach((f) => f(v))
}

/** Whether auto-downloads may use mobile data (default: Wi-Fi only), kept current everywhere. */
export function useAllowsMobileData(): boolean {
  const [v, setV] = useState(mobileData ?? false)
  useEffect(() => {
    mobileDataListeners.add(setV)
    void allowsMobileData().then(setV)
    return () => void mobileDataListeners.delete(setV)
  }, [])
  return v
}

/** Turns auto-download on or off for one followed show. */
export function toggleAutoDownload(podcastId: string): Promise<void> {
  return autoDownloadShows.toggle({ podcastId, since: new Date().toISOString() })
}

async function connection(): Promise<Connection> {
  try {
    const s = await Network.getNetworkStateAsync()
    if (!s.isConnected) return 'none'
    return s.type === Network.NetworkStateType.WIFI || s.type === Network.NetworkStateType.ETHERNET ? 'wifi' : s.type === Network.NetworkStateType.CELLULAR ? 'cellular' : 'unknown'
  } catch {
    return 'unknown'
  }
}

let running = false

/**
 * Downloads new episodes of shows with auto-download on, and asks for the preparation of ones that
 * aren't ready yet (Plus only, within the month's hours). Called when the Library has checked for
 * new episodes; quiet on failure, so it's tried again next time.
 */
export async function runAutoDownload(episodes: readonly NewEpisode[], account: { plan: 'free' | 'plus'; plusUsedSec: number } | null): Promise<void> {
  if (running) return
  running = true
  try {
    await autoDownloadShows.load()
    const shows = autoDownloadShows.current()
    if (!shows.length || !episodes.length) return
    const asked: string[] = JSON.parse((await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) ?? '[]')
    const handled = new Set(await readList(HANDLED_KEY))
    const plan = autoDownloadPlan({
      episodes,
      shows,
      saved: new Set(episodes.filter((e) => isSavedForOffline(e.episodeId)).map((e) => e.episodeId)),
      handled,
      askedToPrepare: new Set(Array.isArray(asked) ? asked : []),
      connection: await connection(),
      allowMobileData: await allowsMobileData(),
      account,
    })
    for (const e of plan.prepare) {
      const r = await api.prepareAuto(e.episodeId).catch(() => undefined)
      if (r) asked.unshift(e.episodeId)
      plog(`auto-download: asked to prepare ${e.title}`)
    }
    if (plan.prepare.length) await AsyncStorage.setItem(ASKED_KEY, JSON.stringify(asked.slice(0, ASKED_MAX))).catch(() => {})
    for (const e of plan.download) {
      await downloadForOffline(e.episodeId).then(
        async () => {
          await rememberHandled(e.episodeId)
          plog(`auto-download: saved ${e.title}`)
        },
        () => plog(`auto-download: couldn’t save ${e.title}; trying again next time`),
      )
    }
  } catch {
    // Never in the learner's way: it tries again next time the Library opens.
  } finally {
    running = false
  }
}
