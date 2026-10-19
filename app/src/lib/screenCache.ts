/**
 * Faster loading (PC-1017-F03): the last answer for a screen (Discover's shelves, a show page) is
 * kept, so going back to it shows that straight away while a fresh copy loads behind it.
 * Discover's shelves are also kept on the phone, so they're there the moment the app opens.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

const PERSIST_PREFIX = 'polycast.screen.v1.'

export class ScreenCache {
  private memory = new Map<string, unknown>()
  constructor(
    private readonly store?: KeyValueStore,
    private readonly maxEntries = 30,
  ) {}

  /** Keys starting with these are also kept on the phone between launches. */
  static persisted = (key: string) => key.startsWith('discover:')

  peek<T>(key: string): T | undefined {
    return this.memory.get(key) as T | undefined
  }

  /** The kept answer, from memory or (for persisted keys) from the phone. */
  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.peek<T>(key)
    if (hit !== undefined || !this.store || !ScreenCache.persisted(key)) return hit
    try {
      const raw = await this.store.getItem(PERSIST_PREFIX + key)
      if (!raw) return undefined
      const v = JSON.parse(raw) as T
      this.remember(key, v)
      return v
    } catch {
      return undefined
    }
  }

  set<T>(key: string, value: T): void {
    this.remember(key, value)
    if (this.store && ScreenCache.persisted(key)) void this.store.setItem(PERSIST_PREFIX + key, JSON.stringify(value)).catch(() => {})
  }

  private remember(key: string, value: unknown) {
    this.memory.delete(key)
    this.memory.set(key, value)
    // Oldest out first, so a long browse doesn't hold every show ever opened.
    while (this.memory.size > this.maxEntries) this.memory.delete(this.memory.keys().next().value as string)
  }
}
