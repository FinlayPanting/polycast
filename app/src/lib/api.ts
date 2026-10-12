import type { Difficulty, GlossEntry, LessonPlan, PodcastSummary, Refusal, Segment, Word } from '@polycast/core'
import { config } from './config'
import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: any,
  ) {
    super(message)
  }
}

async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(json.message ?? json.error ?? 'Something went wrong. Please try again.', res.status, json)
  return json as T
}

export interface EpisodeListing {
  id: string
  title: string
  published: string | null
  duration_sec: number
  image: string | null
  status: 'none' | 'preparing' | 'ready' | 'failed'
  difficulty: Difficulty | null
}

export interface ShowPage {
  podcast: { id: string; title: string; author: string | null; artwork: string | null; language: string | null }
  episodes: EpisodeListing[]
}

export interface ShelfEpisode {
  episodeId: string
  podcastId: string
  title: string
  podcastTitle: string
  image: string | null
  durationSec: number
  ready: boolean
  difficulty: { band: string; label: string } | null
}

export type Shelf =
  | { id: 'picks'; title: string; shows: { podcastId: string; title: string; author: string | null; artwork: string | null; readyEpisodes: number }[] }
  | { id: 'easy' | 'favourites'; title: string; episodes: ShelfEpisode[] }
  | { id: 'top'; title: string; shows: PodcastSummary[] }
  | { id: string; title: string; shows: { podcastIndexId: number; title: string; author: string; artwork: string; feedUrl: string }[] }

export type PrepareResult =
  | { status: 'ready' }
  | { status: 'queued'; jobId: string; charge: 'none' | 'freeEpisode' | 'plus' }

export interface ListenPayload {
  episode: { id: string; title: string; podcastTitle: string; audioUrl: string; image: string | null; durationSec: number }
  transcript: { language: string; segments: Segment[]; words: Word[]; glossary?: Record<string, GlossEntry> }
  guided: boolean
  guidanceLevel: 'light' | 'standard' | 'handsOn' | null
  plan: LessonPlan | null
}

export const api = {
  discover: (language: string) => call<{ shelves: Shelf[] }>('GET', `/v1/discover/${language}`),
  search: (q: string, language: string) => call<{ results: PodcastSummary[] }>('GET', `/v1/search?q=${encodeURIComponent(q)}&language=${language}`),
  openShow: (show: { appleId?: string; feedUrl?: string; podcastId?: string }) => call<ShowPage>('POST', '/v1/podcasts/open', show),
  prepare: (episodeId: string) => call<PrepareResult>('POST', `/v1/episodes/${episodeId}/prepare`),
  job: (jobId: string) => call<{ id: string; status: 'queued' | 'running' | 'done' | 'failed'; stage: string | null }>('GET', `/v1/jobs/${jobId}`),
  listen: (episodeId: string, guide: boolean) => call<ListenPayload>('POST', `/v1/episodes/${episodeId}/listen`, { guide }),
  deleteAccount: () => call<{ ok: true }>('DELETE', '/v1/account'),
}

/** A refusal from the server, with its plain-English message, if this error is one. */
export function refusalOf(e: unknown): { reason: Refusal; message: string } | undefined {
  if (e instanceof ApiError && e.status === 402 && e.body?.reason) return { reason: e.body.reason, message: e.message }
  return undefined
}
