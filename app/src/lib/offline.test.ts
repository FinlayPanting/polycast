import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListenPayload } from './api'

const files = new Map<string, string>()
let lessonCalls = 0
let readyCalls = 0

vi.mock('expo-file-system', () => {
  class File {
    uri: string
    constructor(dir: { uri: string } | string, name?: string) { this.uri = typeof dir === 'string' ? dir.replace(/^file:\/\//, '') : `${dir.uri}/${name}` }
    get name() { return this.uri.slice(this.uri.lastIndexOf('/') + 1) }
    get exists() { return files.has(this.uri) }
    write(text: string) { files.set(this.uri, text) }
    textSync() { return files.get(this.uri)! }
    delete() { files.delete(this.uri) }
  }
  class Directory {
    uri = '/docs/episodes'
    get exists() { return true }
    create() {}
    list() { return [...files.keys()].filter((k) => k.startsWith(this.uri + '/')).map((k) => new File(k)) }
  }
  return { File, Directory, Paths: { document: '/docs' } }
})
vi.mock('./api', () => ({
  api: { lesson: async (id: string) => (lessonCalls++, payload(id, 'https://cdn.test/ep.mp3')) },
}))
vi.mock('./episodeAudio', () => ({
  canSyncOnDevice: true,
  episodesFolder: () => ({ uri: '/docs/episodes' }),
  removeDownload: (id: string) => files.delete(`/docs/episodes/${id}.mp3`),
  getEpisodeReady: async (data: ListenPayload, onStep: (s: unknown) => void) => {
    readyCalls++
    onStep({ step: 'downloading', progress: 0.5 })
    files.set(`/docs/episodes/${data.episode.id}.mp3`, 'audio')
    return { url: `file:///docs/episodes/${data.episode.id}.mp3`, transcript: data.transcript, plan: data.plan, durationSec: 100, synced: true }
  },
}))

function payload(id: string, audioUrl: string): ListenPayload {
  return {
    episode: { id, title: 'Tåget', podcastTitle: 'Svenska Samtal', audioUrl, image: null, durationSec: 100 },
    transcript: { language: 'sv', segments: [], words: [] },
    guided: true,
    guidanceLevel: 'standard',
    plan: null,
  }
}

beforeEach(() => {
  files.clear()
  lessonCalls = 0
  readyCalls = 0
})

describe('saving episodes for offline listening', () => {
  it('downloads everything once, even if the episode page and the player both ask', async () => {
    const { downloadForOffline, loadLesson } = await import('./offline')
    const steps: unknown[] = []
    const [a, b] = await Promise.all([downloadForOffline('ep', (s) => steps.push(s)), downloadForOffline('ep')])
    expect(lessonCalls).toBe(1)
    expect(readyCalls).toBe(1)
    expect(a).toBe(b)
    expect(steps).toEqual([{ step: 'downloading', progress: 0.5 }])
    expect(loadLesson('ep')?.payload.episode.audioUrl).toBe('file:///docs/episodes/ep.mp3')
  })

  it('only keeps lessons whose audio is on the phone', async () => {
    const { saveLesson, loadLesson } = await import('./offline')
    saveLesson(payload('streamed', 'https://cdn.test/ep.mp3'))
    expect(loadLesson('streamed')).toBeUndefined()
  })

  it('forgets a lesson whose audio has gone, and removes everything on request', async () => {
    const { downloadForOffline, isSavedForOffline, listSavedLessons, removeSaved } = await import('./offline')
    await downloadForOffline('ep')
    expect(isSavedForOffline('ep')).toBe(true)
    expect(listSavedLessons().map((s) => s.payload.episode.id)).toEqual(['ep'])
    removeSaved('ep', 'https://cdn.test/ep.mp3')
    expect(isSavedForOffline('ep')).toBe(false)
    expect(listSavedLessons()).toEqual([])
    expect([...files.keys()]).toEqual([])
  })

  it('remembers where the learner is, on the phone', async () => {
    const { savePositionLocally, localPosition } = await import('./offline')
    savePositionLocally('ep', 612.4)
    expect(localPosition('ep')).toBe(612)
  })
})
