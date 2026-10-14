import { config } from './config'
import { supabase } from './supabase'
import * as demo from '../demo/data'

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
}

export interface ListenRow {
  episode_id: string
  position_sec: number
  finished_at: string | null
  updated_at: string
  episodes: { title: string; duration_sec: number; image: string | null; podcasts: { title: string; artwork: string | null } }
}

export async function getEpisode(id: string): Promise<{ episode: EpisodeDetail; activeJob?: { id: string; stage: string | null } }> {
  if (config.demo) return demo.getEpisode(id)
  const { data, error } = await supabase.from('episodes').select('id, title, duration_sec, image, audio_url, status, difficulty, podcasts(title, artwork)').eq('id', id).single()
  if (error) throw new Error('We couldn’t load this episode.')
  const { data: job } = await supabase.from('prep_jobs').select('id, stage').eq('episode_id', id).in('status', ['queued', 'running']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return { episode: data as unknown as EpisodeDetail, activeJob: job ?? undefined }
}

export async function listListens(): Promise<ListenRow[]> {
  if (config.demo) return demo.listListens()
  const { data } = await supabase
    .from('listens')
    .select('episode_id, position_sec, finished_at, updated_at, episodes(title, duration_sec, image, podcasts(title, artwork))')
    .order('updated_at', { ascending: false })
    .limit(100)
  return (data ?? []) as unknown as ListenRow[]
}

/** Where the learner left off, if they started this episode before and didn't finish. */
export async function resumePosition(episodeId: string): Promise<number> {
  if (config.demo) return 0
  const { data } = await supabase.from('listens').select('position_sec, finished_at').eq('episode_id', episodeId).maybeSingle()
  return data && !data.finished_at && data.position_sec > 5 ? data.position_sec - 3 : 0
}

export async function savePosition(userId: string, episodeId: string, sec: number, finished = false): Promise<void> {
  if (config.demo) return
  const patch: Record<string, unknown> = { position_sec: sec, updated_at: new Date().toISOString() }
  if (finished) patch.finished_at = new Date().toISOString()
  await supabase.from('listens').update(patch).eq('user_id', userId).eq('episode_id', episodeId)
}
