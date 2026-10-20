import type { EpisodeEstimate } from './ownKeysCore'
import type { Difficulty, GlossEntry, LessonPlan, PodcastSummary, Primer, Refusal, Segment, Word } from '@polycast/core'
import { config } from './config'
import { demoCall } from '../demo/api'
import { supabase } from './supabase'
import { apiRoute, fetchWithTimeout, REQUEST_TIMEOUT_MS } from './net'
import { plog } from './playbackLog'

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
  const started = Date.now()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  // A time limit, so weak Wi-Fi fails (and a saved copy can play) instead of hanging.
  const res = await fetchWithTimeout(fetch, `${config.apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, timeoutMs)
  const json = await res.json().catch(() => ({}))
  // How long each screen waits on the server, in the shareable playback log (PC-1017-F03). The
  // path only, never a search's words.
  plog(`api ${method} ${apiRoute(path)} ${res.status} in ${Date.now() - started} ms`)
  if (!res.ok) throw new ApiError(json.message ?? json.error ?? 'Something went wrong. Please try again.', res.status, json)
  return json as T
}

export interface EpisodeListing {
  id: string
  title: string
  description?: string | null
  published: string | null
  duration_sec: number
  image: string | null
  status: 'none' | 'preparing' | 'ready' | 'failed'
  difficulty: Difficulty | null
}

export interface ShowPage {
  podcast: { id: string; title: string; author: string | null; artwork: string | null; language: string | null; description?: string | null }
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
  | { status: 'queued'; jobId: string; charge: 'none' | 'freeEpisode' | 'plus' | 'ownKeys' }

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
  /** The guide whose voice this plan was recorded in (PC-1017-F01); missing on lessons saved before 19 Oct 2026. */
  guideId?: string | null
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
  /** Shared translations (PC-1017-T1): a list's titles, and a show's or episode's description by id. */
  translate: (req: { titles?: string[]; podcastId?: string; episodeId?: string }) =>
    call<{ to: string; titles: (string | null)[]; podcastDescription: string | null; episodeDescription: string | null }>('POST', '/v1/translate', req, 20_000),
  /** With `ownKeys`, the episode is prepared on the learner's own API keys (PC-1017-K1). */
  prepare: (episodeId: string, ownKeys?: { elevenlabs: string; gemini: string }) =>
    call<PrepareResult>('POST', `/v1/episodes/${episodeId}/prepare`, ownKeys ? { ownKeys } : undefined),
  job: (jobId: string) => call<{ id: string; status: 'queued' | 'running' | 'done' | 'failed'; stage: string | null; message?: string }>('GET', `/v1/jobs/${jobId}`),
  /** 'That looks wrong' (PC-1018-04): flags one subtitle line. Only the episode and line are sent. */
  reportLine: (episodeId: string, segmentId: string) => call<{ ok: true }>('POST', `/v1/episodes/${episodeId}/report-line`, { segmentId }),
  testKey: (provider: 'elevenlabs' | 'gemini', key: string) => call<{ ok: true } | { ok: false; message: string }>('POST', '/v1/keys/test', { provider, key }),
  /** Own-keys cost estimate from an episode's length, worked out on the server (PC-1017-K4). */
  /** One episode's own-keys estimate, leaving out transcription when it isn't needed (PC-1020-09). */
  ownKeysEpisodeEstimate: (episodeId: string) => call<EpisodeEstimate>('GET', `/v1/episodes/${episodeId}/own-keys-estimate`),
  ownKeysEstimate: (durationSec: number) => call<{ elevenlabsUSD: number; googleUSD: number; totalUSD: number }>('GET', `/v1/keys/estimate?durationSec=${Math.round(durationSec)}`),
  /** What preparing this episode on the learner's own keys actually used, if they did. */
  ownKeysCost: (episodeId: string) => call<{ usedUSD: number | null }>('GET', `/v1/episodes/${episodeId}/own-keys-cost`),
  /** What's new (PC-1019-F02): the change log, public. */
  changelog: () => call<{ entries: unknown[] }>('GET', '/changelog'),
  forgetKeys: () => call<{ ok: true }>('DELETE', '/v1/keys'),
  /** `level` is the guide intensity chosen for this episode; left out, the server uses the learner's default. */
  listen: (episodeId: string, guide: boolean, level?: 'light' | 'standard' | 'handsOn') =>
    call<ListenPayload>('POST', `/v1/episodes/${episodeId}/listen`, level ? { guide, level } : { guide }),
  /** The same lesson, for saving to the phone: doesn't count as starting a listen. */
  lesson: (episodeId: string, guide: boolean) => call<ListenPayload>('POST', `/v1/episodes/${episodeId}/lesson`, { guide }),
  /** The Episode Primer shown before pressing play; null for episodes prepared before primers. */
  primer: (episodeId: string) => call<{ primer: Primer | null; guideId?: string | null }>('GET', `/v1/episodes/${episodeId}/primer`),
  deleteAccount: () => call<{ ok: true }>('DELETE', '/v1/account'),
}

/** A refusal from the server, with its plain-English message, if this error is one. */
export function refusalOf(e: unknown): { reason: Refusal; message: string } | undefined {
  if (e instanceof ApiError && e.status === 402 && e.body?.reason) return { reason: e.body.reason, message: e.message }
  return undefined
}
