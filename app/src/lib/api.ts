import type { Difficulty, GlossEntry, LessonPlan, PodcastSummary, Primer, Refusal, Segment, Word } from '@polycast/core'
import { config } from './config'
import { demoCall } from '../demo/api'
import { supabase } from './supabase'
import { fetchWithTimeout, REQUEST_TIMEOUT_MS } from './net'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: any,
  ) {
    super(message)
  }
}

async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  if (config.demo) return demoCall<T>(method, path)
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  // A time limit, so weak Wi-Fi fails (and a saved copy can play) instead of hanging.
  const res = await fetchWithTimeout(fetch, `${config.apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, timeoutMs)
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
  | { id: 'for-you'; title: string; shows: ((PodcastSummary | { podcastIndexId: number; title: string; author: string; artwork: string; feedUrl: string }) & { why: string })[] }
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
  /** Set on the phone, not by the server: the advert breaks in the learner's own copy. */
  adverts?: { start: number; end: number }[]
  /** The free episode this (free) learner chose: its wrap-up gently mentions Plus. */
  freeEpisode?: boolean
  guidanceLevel: 'light' | 'standard' | 'handsOn' | null
  plan: LessonPlan | null
  /** Fingerprint of the copy we transcribed, to line the lesson up with the learner's copy. */
  syncUrl?: string | null
}

/** One of Mia's picks for a mood (server/src/mood.ts). */
export type MoodPick =
  | { kind: 'show'; title: string; author: string | null; artwork: string | null; podcastId?: string; appleId?: string; feedUrl?: string; why: string }
  | { kind: 'episode'; episodeId: string; podcastId: string; title: string; podcastTitle: string; artwork: string | null; why: string }

export const api = {
  mood: (language: string, mood: string) => call<{ mood: string; picks: MoodPick[] }>('POST', `/v1/discover/${language}/mood`, { mood }, 20_000),
  discover: (language: string) => call<{ shelves: Shelf[] }>('GET', `/v1/discover/${language}`),
  search: (q: string, language: string) => call<{ results: PodcastSummary[] }>('GET', `/v1/search?q=${encodeURIComponent(q)}&language=${language}`),
  // Opening a show re-reads its feed on the server, which may take up to 15 seconds itself.
  openShow: (show: { appleId?: string; feedUrl?: string; podcastId?: string }) => call<ShowPage>('POST', '/v1/podcasts/open', show, 25_000),
  prepare: (episodeId: string) => call<PrepareResult>('POST', `/v1/episodes/${episodeId}/prepare`),
  job: (jobId: string) => call<{ id: string; status: 'queued' | 'running' | 'done' | 'failed'; stage: string | null }>('GET', `/v1/jobs/${jobId}`),
  /** `level` is the guide intensity chosen for this episode; left out, the server uses the learner's default. */
  listen: (episodeId: string, guide: boolean, level?: 'light' | 'standard' | 'handsOn') =>
    call<ListenPayload>('POST', `/v1/episodes/${episodeId}/listen`, level ? { guide, level } : { guide }),
  /** The same lesson, for saving to the phone: doesn't count as starting a listen. */
  lesson: (episodeId: string, guide: boolean) => call<ListenPayload>('POST', `/v1/episodes/${episodeId}/lesson`, { guide }),
  /** The Episode Primer shown before pressing play; null for episodes prepared before primers. */
  primer: (episodeId: string) => call<{ primer: Primer | null }>('GET', `/v1/episodes/${episodeId}/primer`),
  deleteAccount: () => call<{ ok: true }>('DELETE', '/v1/account'),
}

/** A refusal from the server, with its plain-English message, if this error is one. */
export function refusalOf(e: unknown): { reason: Refusal; message: string } | undefined {
  if (e instanceof ApiError && e.status === 402 && e.body?.reason) return { reason: e.body.reason, message: e.message }
  return undefined
}
