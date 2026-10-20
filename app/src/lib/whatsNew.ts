import AsyncStorage from '@react-native-async-storage/async-storage'
import { hasUnread, newestDate, parseChangelog, type ChangelogEntry } from '@polycast/core'
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

/**
 * What's new (PC-1019-F02): the change log from the server, the last copy kept on the phone for
 * offline, and the newest build the learner has seen (for the orange dot).
 */
const CACHE_KEY = 'polycast.changelog.v1'
const SEEN_KEY = 'polycast.changelog.seen.v1'

export interface WhatsNewStore {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

/** The fresh log if the server answers, otherwise the last copy kept on the phone. */
export async function loadChangelog(fetchLog: () => Promise<unknown> = api.changelog, store: WhatsNewStore = AsyncStorage): Promise<{ entries: ChangelogEntry[]; offline: boolean }> {
  try {
    const entries = parseChangelog(await fetchLog())
    if (entries.length) void store.setItem(CACHE_KEY, JSON.stringify({ entries })).catch(() => {})
    return { entries, offline: false }
  } catch {
    try {
      return { entries: parseChangelog(JSON.parse((await store.getItem(CACHE_KEY)) ?? 'null')), offline: true }
    } catch {
      return { entries: [], offline: true }
    }
  }
}

export async function markSeen(entries: readonly ChangelogEntry[], store: WhatsNewStore = AsyncStorage): Promise<void> {
  const newest = newestDate(entries)
  if (newest) await store.setItem(SEEN_KEY, newest).catch(() => {})
}

export async function unread(entries: readonly ChangelogEntry[], store: WhatsNewStore = AsyncStorage): Promise<boolean> {
  return hasUnread(entries, (await store.getItem(SEEN_KEY).catch(() => null)) ?? undefined)
}

/** Whether to show the dot on the What's new row; checked again when asked. */
export function useWhatsNewDot(): { dot: boolean; refresh: () => void } {
  const [dot, setDot] = useState(false)
  const refresh = useCallback(() => {
    void loadChangelog().then(({ entries }) => unread(entries)).then(setDot, () => setDot(false))
  }, [])
  useEffect(refresh, [refresh])
  return { dot, refresh }
}
