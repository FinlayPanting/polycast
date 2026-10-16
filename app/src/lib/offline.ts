import { Directory, File, Paths } from 'expo-file-system'
import { api, type ListenPayload } from './api'
import { canSyncOnDevice, episodesFolder, getEpisodeReady, removeDownload, type GetReadyStep, type ReadyEpisode } from './episodeAudio'

/**
 * Episodes saved for offline listening: the learner's copy of the audio, the guide's lines and the
 * lesson itself (subtitles and plan, already lined up with that copy), all on the phone. Once saved,
 * an episode plays with no connection, and the learner can remove it and download it again later.
 */

export interface SavedLesson {
  savedAt: string
  /** The player's payload, pointing at the files on the phone. */
  payload: ListenPayload
}

const folder = () => new Directory(Paths.document, 'episodes')
const lessonFile = (episodeId: string) => new File(folder(), `${episodeId}.lesson.json`)
const positionFile = (episodeId: string) => new File(folder(), `${episodeId}.position`)

/** The player's payload once the episode and the guide's lines are on the phone. */
export function readyPayload(fetched: ListenPayload, ready: ReadyEpisode): ListenPayload {
  return { ...fetched, transcript: ready.transcript, plan: ready.plan, episode: { ...fetched.episode, audioUrl: ready.url, durationSec: ready.durationSec } }
}

const isOnPhone = (uri: string) => uri.startsWith('file:') || uri.startsWith('/')

export function saveLesson(payload: ListenPayload): void {
  if (!isOnPhone(payload.episode.audioUrl)) return // only a copy that plays offline is worth keeping
  episodesFolder()
  lessonFile(payload.episode.id).write(JSON.stringify({ savedAt: new Date().toISOString(), payload } satisfies SavedLesson))
}

/** The saved lesson, if it and its audio are still on the phone. */
export function loadLesson(episodeId: string): SavedLesson | undefined {
  try {
    const f = lessonFile(episodeId)
    if (!f.exists) return undefined
    const saved = JSON.parse(f.textSync()) as SavedLesson
    const audio = new File(saved.payload.episode.audioUrl)
    return audio.exists ? saved : undefined
  } catch {
    return undefined
  }
}

export const isSavedForOffline = (episodeId: string) => loadLesson(episodeId) !== undefined

export function listSavedLessons(): SavedLesson[] {
  try {
    const dir = folder()
    if (!dir.exists) return []
    return dir
      .list()
      .filter((f): f is File => f instanceof File && f.name.endsWith('.lesson.json'))
      .map((f) => loadLesson(f.name.replace(/\.lesson\.json$/, '')))
      .filter((s): s is SavedLesson => s !== undefined)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  } catch {
    return []
  }
}

/** Removes everything saved for this episode: audio, the guide's lines, fingerprint and lesson. */
export function removeSaved(episodeId: string, audioUrl: string): void {
  removeDownload(episodeId, audioUrl)
  for (const f of [lessonFile(episodeId), positionFile(episodeId)]) if (f.exists) f.delete()
}

const inflight = new Map<string, { promise: Promise<ListenPayload>; listeners: Set<(s: GetReadyStep) => void> }>()

/**
 * Downloads everything an episode needs to play offline: fetches the lesson (without counting it as
 * a listen), downloads the learner's copy, lines the lesson up with it and saves the guide's lines.
 * The episode page starts this as soon as preparation finishes; a second caller joins the first.
 */
export function downloadForOffline(episodeId: string, onStep: (s: GetReadyStep) => void = () => {}): Promise<ListenPayload> {
  let d = inflight.get(episodeId)
  if (!d) {
    const listeners = new Set<(s: GetReadyStep) => void>()
    const promise = (async () => {
      if (!canSyncOnDevice) throw new Error('This phone can’t save episodes yet.')
      const fetched = await api.lesson(episodeId, true)
      const ready = await getEpisodeReady(fetched, (s) => listeners.forEach((l) => l(s)))
      const payload = readyPayload(fetched, ready)
      saveLesson(payload)
      return payload
    })().finally(() => inflight.delete(episodeId))
    d = { promise, listeners }
    inflight.set(episodeId, d)
  }
  const entry = d
  entry.listeners.add(onStep)
  return entry.promise.finally(() => entry.listeners.delete(onStep))
}

/** Where the learner is in an episode, kept on the phone too, so resuming works offline. */
export function savePositionLocally(episodeId: string, sec: number): void {
  try {
    episodesFolder()
    positionFile(episodeId).write(String(Math.round(sec)))
  } catch {
    // Not important enough to interrupt listening.
  }
}

export function localPosition(episodeId: string): number | undefined {
  try {
    const f = positionFile(episodeId)
    return f.exists ? Number(f.textSync()) || undefined : undefined
  } catch {
    return undefined
  }
}
