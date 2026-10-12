import { useState, useEffect } from 'react'
import { runPipeline, type PipelineStage } from './pipeline'
import type { Episode } from './rss'
import type { ItunesResult } from './itunes'
import { getApiKeys } from './storage'

export type DownloadStatus = 'processing' | 'done' | 'error'

export interface DownloadEntry {
  guid: string
  status: DownloadStatus
  stage?: PipelineStage
  progress: number // 0-1 overall
  error?: string
  episodeTitle: string
  podcastName: string
  podcastArtwork: string
}

// Weighted stages for computing overall progress
const STAGE_ORDER: PipelineStage[] = ['download', 'transcribe', 'translate', 'summarize', 'tts', 'build']
const STAGE_WEIGHT: Record<PipelineStage, number> = {
  download: 0.20,
  transcribe: 0.30,
  translate: 0.10,
  summarize: 0.15,
  tts: 0.20,
  build: 0.05,
}

function overallProgress(stage: PipelineStage, stageProgress: number): number {
  const base = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(stage)).reduce((s, k) => s + STAGE_WEIGHT[k], 0)
  return base + STAGE_WEIGHT[stage] * stageProgress
}

const queue = new Map<string, DownloadEntry>()
const controllers = new Map<string, AbortController>()

function notify() {
  window.dispatchEvent(new Event('polycast:downloads'))
}

export function getDownloadEntry(guid: string): DownloadEntry | undefined {
  return queue.get(guid)
}

export function useDownloadEntry(guid: string): DownloadEntry | undefined {
  const [entry, setEntry] = useState<DownloadEntry | undefined>(() => queue.get(guid))
  useEffect(() => {
    const update = () => setEntry(queue.get(guid) ? { ...queue.get(guid)! } : undefined)
    window.addEventListener('polycast:downloads', update)
    return () => window.removeEventListener('polycast:downloads', update)
  }, [guid])
  return entry
}

// Returns a stable Map reference; forces re-render on any queue change
export function useDownloadMap(): ReadonlyMap<string, DownloadEntry> {
  const [, setTick] = useState(0)
  useEffect(() => {
    const update = () => setTick((t) => t + 1)
    window.addEventListener('polycast:downloads', update)
    return () => window.removeEventListener('polycast:downloads', update)
  }, [])
  return queue
}

export async function startDownload(
  episode: Episode,
  podcast: ItunesResult,
  language: string,
  summaryMin: number,
  summaryMax: number,
): Promise<void> {
  const { guid } = episode
  if (queue.get(guid)?.status === 'processing') return

  const keys = getApiKeys()

  const base: DownloadEntry = {
    guid,
    status: 'processing',
    progress: 0,
    episodeTitle: episode.title,
    podcastName: podcast.collectionName,
    podcastArtwork: podcast.artworkUrl100,
  }
  queue.set(guid, base)
  notify()

  const controller = new AbortController()
  controllers.set(guid, controller)

  try {
    await runPipeline({
      episode,
      podcast,
      language,
      summaryMin,
      summaryMax,
      openaiKey: keys.openai,
      elevenlabsKey: keys.elevenlabs,
      onProgress: (p) => {
        queue.set(guid, {
          ...base,
          status: 'processing',
          stage: p.stage,
          progress: overallProgress(p.stage, p.progress),
        })
        notify()
      },
      signal: controller.signal,
    })
    queue.set(guid, { ...base, status: 'done', progress: 1 })
    notify()
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      queue.set(guid, { ...base, status: 'error', error: String((e as Error).message || e) })
    } else {
      queue.delete(guid)
    }
    notify()
  } finally {
    controllers.delete(guid)
  }
}

export function cancelDownload(guid: string) {
  controllers.get(guid)?.abort()
}
