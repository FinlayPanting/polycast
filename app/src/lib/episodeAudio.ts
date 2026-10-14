import { alignFingerprints, retimeLesson, type LessonPlan, type SyncMap } from '@polycast/core'
import { Directory, DownloadTask, File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import { PolycastFingerprint } from '../../modules/polycast-fingerprint'
import type { ListenPayload } from './api'

/**
 * The learner's own copy of an episode, on their phone.
 *
 * Hosts can stitch different adverts into each download, so the lesson (timed on the copy we
 * transcribed) is lined up with this copy before playing: both are fingerprinted and matched, and
 * every time in the lesson is moved onto this copy (see @polycast/core sync.ts). The download stays
 * on the phone, so the episode also plays offline. It's never uploaded or shared.
 */

export type GetReadyStep = { step: 'downloading'; progress: number } | { step: 'syncing' }

const folder = () => new Directory(Paths.document, 'episodes')
const AUDIO_TYPES = ['mp3', 'm4a', 'aac', 'mp4', 'wav', 'ogg', 'opus'] as const

/**
 * The file keeps the episode's real extension: iOS decides how to decode a file from it, and an
 * unknown one (".audio") makes both the player and the fingerprinting fail ("Cannot Open").
 */
export function audioExtension(url: string): string {
  const path = url.split(/[?#]/)[0]!.toLowerCase()
  const ext = path.slice(path.lastIndexOf('.') + 1)
  return (AUDIO_TYPES as readonly string[]).includes(ext) ? ext : 'mp3'
}
const audioFile = (episodeId: string, url: string) => new File(folder(), `${episodeId}.${audioExtension(url)}`)
const fingerprintFile = (episodeId: string) => new File(folder(), `${episodeId}.fp`)

/** Whether this phone can download and line up episodes (not the web preview or an older build). */
export const canSyncOnDevice = Platform.OS === 'ios' && PolycastFingerprint !== null

/** Downloads the episode unless it's already here; reports progress from 0 to 1. */
export async function downloadEpisode(episodeId: string, url: string, onProgress: (p: number) => void, signal?: AbortSignal): Promise<string> {
  folder().create({ idempotent: true, intermediates: true })
  // Builds from 13 Oct 2026 saved episodes as ".audio", which iOS can't open: clear those out.
  const unreadable = new File(folder(), `${episodeId}.audio`)
  if (unreadable.exists) unreadable.delete()
  const file = audioFile(episodeId, url)
  if (file.exists && file.size > 0) return file.uri
  const partial = new File(folder(), `${episodeId}.partial`)
  if (partial.exists) partial.delete()
  const task = new DownloadTask(url, partial, {
    onProgress: (p) => p.totalBytes > 0 && onProgress(Math.min(1, p.bytesWritten / p.totalBytes)),
    signal,
  })
  const done = await task.downloadAsync()
  if (!done) throw new Error('The download was paused.')
  await done.move(file)
  // A new copy may have new adverts: any fingerprint of an older copy no longer applies.
  const fp = fingerprintFile(episodeId)
  if (fp.exists) fp.delete()
  return file.uri
}

function fromBase64(b64: string): Uint8Array {
  const bin = globalThis.atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Fingerprint of the downloaded copy, made once and kept next to it. */
async function localFingerprint(episodeId: string, uri: string): Promise<Uint8Array> {
  const cached = fingerprintFile(episodeId)
  if (cached.exists) return fromBase64(cached.textSync())
  const b64 = await PolycastFingerprint!.fingerprint(uri)
  cached.write(b64)
  return fromBase64(b64)
}

/** Fingerprint of the copy we transcribed, from the server. */
async function referenceFingerprint(syncUrl: string): Promise<Uint8Array> {
  const res = await fetch(syncUrl)
  if (!res.ok) throw new Error(`Couldn't fetch the episode's fingerprint (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}

export interface ReadyEpisode {
  /** Where to play from: the downloaded copy, or the stream if this phone can't download. */
  url: string
  transcript: ListenPayload['transcript']
  plan: LessonPlan | null
  durationSec: number
  /** Whether the lesson was lined up with this copy. */
  synced: boolean
  map?: SyncMap
}

/**
 * Gets an episode ready to play: downloads the learner's copy, then lines the lesson up with it.
 * If lining up fails, it plays the stream with the lesson's own times, never nothing.
 */
export async function getEpisodeReady(data: ListenPayload, onStep: (s: GetReadyStep) => void, signal?: AbortSignal): Promise<ReadyEpisode> {
  const unsynced = { url: data.episode.audioUrl, transcript: data.transcript, plan: data.plan, durationSec: data.episode.durationSec, synced: false }
  if (!canSyncOnDevice) {
    if (__DEV__) console.log('[listen] this build can’t download and line up episodes: streaming with the lesson’s own times')
    return unsynced
  }
  onStep({ step: 'downloading', progress: 0 })
  const uri = await downloadEpisode(data.episode.id, data.episode.audioUrl, (progress) => onStep({ step: 'downloading', progress }), signal)
  const local = { ...unsynced, url: uri }
  if (!data.syncUrl) return local
  try {
    onStep({ step: 'syncing' })
    const [mine, theirs] = await Promise.all([referenceFingerprint(data.syncUrl), localFingerprint(data.episode.id, uri)])
    // Let the progress message paint before the matching (a few hundred milliseconds) runs.
    await new Promise((r) => setTimeout(r, 16))
    const map = alignFingerprints(mine, theirs)
    const r = retimeLesson({ ...data.transcript, source: 'scribe' }, data.plan, map)
    if (__DEV__) console.log('[listen] lined up with this copy:', { synced: r.synced, listenerDuration: map.listenerDuration, referenceDuration: data.episode.durationSec, file: uri.split('/').pop() })
    return { url: uri, transcript: r.transcript, plan: r.plan, durationSec: map.listenerDuration || data.episode.durationSec, synced: r.synced, map }
  } catch (e) {
    // Play the stream with the lesson's own times: never leave the learner unable to listen.
    console.warn('Polycast: couldn’t line the lesson up with this copy; streaming with its own times', e)
    return unsynced
  }
}

/**
 * The downloaded copy's address if this phone has it, else the stream. Word review uses this so a
 * saved word's clip (timed on the learner's copy) plays from that same copy.
 */
export function localOrStream(episodeId: string | undefined, streamUrl: string): string {
  if (!episodeId || Platform.OS === 'web') return streamUrl
  const f = audioFile(episodeId, streamUrl)
  return f.exists ? f.uri : streamUrl
}

/** Removes a downloaded episode (and its fingerprint) from the phone. */
export function removeDownload(episodeId: string, url: string): void {
  for (const f of [audioFile(episodeId, url), fingerprintFile(episodeId)]) if (f.exists) f.delete()
}
