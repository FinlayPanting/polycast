import { openDB } from 'idb'

export interface ApiKeys {
  openai: string
  elevenlabs: string
}

export interface Preferences {
  summaryMin: number
  summaryMax: number
  defaultLanguage: string
}

export interface FollowedPodcast {
  id: string
  title: string
  author: string
  artwork: string
  feedUrl: string
}

export interface SummaryPoint {
  timestamp: number
  text: string
  audioBase64: string
}

export interface TranscriptLine {
  start: number
  end: number
  original: string
  translation: string
}

export interface ProcessedEpisode {
  guid: string
  transcript: string
  titleTranslation?: string
  transcriptLines?: TranscriptLine[]
  summaries: SummaryPoint[]
  enclosureUrl: string
  // Episode/podcast metadata stored so the Episodes tab can display and navigate
  episodeTitle?: string
  episodePubDate?: string
  episodeDuration?: string
  podcastId?: string
  podcastName?: string
  podcastArtwork?: string
}

// ─── localStorage ─────────────────────────────────────────────────────────────

export function getApiKeys(): ApiKeys {
  try {
    return JSON.parse(localStorage.getItem('polycast:keys') ?? '{}') as ApiKeys
  } catch {
    return { openai: '', elevenlabs: '' }
  }
}

export function saveApiKeys(keys: ApiKeys): void {
  localStorage.setItem('polycast:keys', JSON.stringify(keys))
}

export function getPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem('polycast:prefs') ?? '{}') as Partial<Preferences>
    return {
      summaryMin: p.summaryMin ?? 60,
      summaryMax: p.summaryMax ?? 120,
      defaultLanguage: p.defaultLanguage ?? 'Swedish',
    }
  } catch {
    return { summaryMin: 60, summaryMax: 120, defaultLanguage: 'Swedish' }
  }
}

export function savePreferences(prefs: Preferences): void {
  localStorage.setItem('polycast:prefs', JSON.stringify(prefs))
}

export function getFollowing(): FollowedPodcast[] {
  try {
    return JSON.parse(localStorage.getItem('polycast:following') ?? '[]') as FollowedPodcast[]
  } catch {
    return []
  }
}

export function followPodcast(podcast: FollowedPodcast): void {
  const list = getFollowing().filter((p) => p.id !== podcast.id)
  localStorage.setItem('polycast:following', JSON.stringify([podcast, ...list]))
}

export function unfollowPodcast(id: string): void {
  const list = getFollowing().filter((p) => p.id !== id)
  localStorage.setItem('polycast:following', JSON.stringify(list))
}

// ─── IndexedDB ────────────────────────────────────────────────────────────────

const DB_NAME = 'polycast'
const STORE = 'episodes'

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'guid' })
    },
  })
}

export async function cacheEpisode(episode: ProcessedEpisode): Promise<void> {
  const db = await getDb()
  await db.put(STORE, episode)
}

export async function getCachedEpisodeAsync(guid: string): Promise<ProcessedEpisode | null> {
  const db = await getDb()
  return (await db.get(STORE, guid)) ?? null
}

export async function getAllCachedEpisodes(): Promise<ProcessedEpisode[]> {
  const db = await getDb()
  return db.getAll(STORE)
}

export async function getAllCachedGuids(): Promise<Set<string>> {
  const db = await getDb()
  const all = await db.getAll(STORE)
  return new Set(all.map((e) => e.guid))
}

export async function deleteCachedEpisode(guid: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE, guid)
}
