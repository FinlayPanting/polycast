import { config } from './config'
import { supabase } from './supabase'
import * as demo from '../demo/data'
import { listSavedLessons, loadLesson, localPosition, savePositionLocally } from './offline'

/** Reads and writes the app makes straight to the database (row-level security limits them to the learner's own rows). */

export interface EpisodeDetail {
  id: string
  title: string
  duration_sec: number
  image: string | null
  audio_url: string
  status: 'none' | 'preparing' | 'ready' | 'failed'
  difficulty: { label: string } | null
  podcasts: { title: string; artwork: string | null }
  /** From the feed, cleaned (PC-1017-T1); missing offline. */
  description?: string | null
}

export interface ListenRow {
  episode_id: string
  position_sec: number
  finished_at: string | null
  updated_at: string
  episodes: { title: string; duration_sec: number; image: string | null; podcast_id?: string; podcasts: { title: string; artwork: string | null } }
}

export async function getEpisode(id: string): Promise<{ episode: EpisodeDetail; activeJob?: { id: string; stage: string | null }; offline?: boolean; preparedByMe?: boolean }> {
  if (config.demo) return demo.getEpisode(id)
  const { data, error } = await supabase.from('episodes').select('id, title, duration_sec, image, audio_url, status, difficulty, description, podcasts(title, artwork)').eq('id', id).single()
  if (error) {
    // Offline: an episode saved on the phone still opens and plays.
    const saved = loadLesson(id)?.payload.episode
    if (saved) return { episode: { id, title: saved.title, duration_sec: saved.durationSec, image: saved.image, audio_url: saved.audioUrl, status: 'ready', difficulty: null, podcasts: { title: saved.podcastTitle, artwork: null } }, offline: true }
    throw new Error('We couldn’t load this episode.')
  }
  const { data: job } = await supabase.from('prep_jobs').select('id, stage').eq('episode_id', id).in('status', ['queued', 'running']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  // Learners only see their own jobs, so any finished one means this learner asked for it.
  const { data: mine } = await supabase.from('prep_jobs').select('id').eq('episode_id', id).eq('status', 'done').limit(1).maybeSingle()
  return { episode: data as unknown as EpisodeDetail, activeJob: job ?? undefined, preparedByMe: Boolean(mine) }
}

export async function listListens(): Promise<ListenRow[]> {
  if (config.demo) return demo.listListens()
  const { data, error } = await supabase
    .from('listens')
    .select('episode_id, position_sec, finished_at, updated_at, episodes(title, duration_sec, image, podcast_id, podcasts(title, artwork))')
    .order('updated_at', { ascending: false })
    .limit(100)
  // Offline: what's saved on the phone.
  if (error) return listSavedLessons().map(({ savedAt, payload: { episode: e } }) => ({ episode_id: e.id, position_sec: localPosition(e.id) ?? 0, finished_at: null, updated_at: savedAt, episodes: { title: e.title, duration_sec: e.durationSec, image: e.image, podcasts: { title: e.podcastTitle, artwork: null } } }))
  return (data ?? []) as unknown as ListenRow[]
}

/** Where the learner left off, if they started this episode before and didn't finish. */
export async function resumePosition(episodeId: string): Promise<number> {
  if (config.demo) return 0
  const { data, error } = await supabase.from('listens').select('position_sec, finished_at').eq('episode_id', episodeId).maybeSingle()
  // Offline, or the phone is further on than the server heard (it saved while offline).
  const local = localPosition(episodeId)
  if (error) return local && local > 5 ? local - 3 : 0
  const server = data && !data.finished_at ? data.position_sec : 0
  const best = Math.max(server, data?.finished_at ? 0 : (local ?? 0))
  return best > 5 ? best - 3 : 0
}

export async function savePosition(userId: string, episodeId: string, sec: number, finished = false): Promise<void> {
  if (config.demo) return
  savePositionLocally(episodeId, finished ? 0 : sec)
  const patch: Record<string, unknown> = { position_sec: sec, updated_at: new Date().toISOString() }
  if (finished) patch.finished_at = new Date().toISOString()
  await supabase.from('listens').update(patch).eq('user_id', userId).eq('episode_id', episodeId)
}
