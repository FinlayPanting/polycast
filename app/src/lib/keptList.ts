import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { followId, laterId, parseKept, removeKept, toggleKept, type FollowedShow, type LaterEpisode } from './keptListCore'

/**
 * A list kept on the phone (AsyncStorage), shared by every screen: a change on the episode page
 * shows at once in the Library. Simplest option picked: kept on this phone rather than the account,
 * so it needs no new database table (see docs/DECISIONS.md).
 */
export class KeptList<T> {
  private items: T[] = []
  private loaded?: Promise<void>
  private listeners = new Set<(items: T[]) => void>()
  constructor(
    private readonly key: string,
    private readonly idOf: (t: T) => string,
  ) {}

  load(): Promise<void> {
    this.loaded ??= AsyncStorage.getItem(this.key)
      .then((raw) => this.set(parseKept(raw, this.idOf), false))
      .catch(() => {})
    return this.loaded
  }

  current = () => this.items

  has = (id: string) => this.items.some((t) => this.idOf(t) === id)

  async toggle(item: T): Promise<void> {
    await this.load()
    this.set(toggleKept(this.items, item, this.idOf))
  }

  /** Adds `item` at the end unless one with its id is already there. */
  async add(item: T): Promise<void> {
    await this.load()
    if (!this.has(this.idOf(item))) this.set([...this.items, item])
  }

  async remove(id: string): Promise<void> {
    await this.load()
    this.set(removeKept(this.items, id, this.idOf))
  }

  subscribe(f: (items: T[]) => void): () => void {
    this.listeners.add(f)
    return () => void this.listeners.delete(f)
  }

  private set(items: T[], persist = true) {
    this.items = items
    if (persist) void AsyncStorage.setItem(this.key, JSON.stringify(items)).catch(() => {})
    for (const f of this.listeners) f(items)
  }
}

export const listenLater = new KeptList<LaterEpisode>('polycast.listenLater.v1', laterId)
export const followedShows = new KeptList<FollowedShow>('polycast.follows.v1', followId)

/** The list's items, kept current as they change anywhere in the app. */
export function useKept<T>(list: KeptList<T>): T[] {
  const [items, setItems] = useState(list.current())
  useEffect(() => {
    const off = list.subscribe(setItems)
    void list.load().then(() => setItems(list.current()))
    return off
  }, [list])
  return items
}
