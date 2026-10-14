import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = new Map<string, number>()
let tasks: { url: string; progress: (p: { bytesWritten: number; totalBytes: number }) => void; finish: () => void }[] = []

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('../../modules/polycast-fingerprint', () => ({ PolycastFingerprint: { fingerprint: async () => '' } }))
vi.mock('expo-file-system', () => {
  class File {
    uri: string
    constructor(dir: { uri: string } | string, name?: string) {
      this.uri = typeof dir === 'string' ? dir : `${dir.uri}/${name}`
    }
    get exists() { return files.has(this.uri) }
    get size() { return files.get(this.uri) ?? 0 }
    delete() { files.delete(this.uri) }
    write() { files.set(this.uri, 1) }
    textSync() { return '' }
    async move(to: File) { files.set(to.uri, files.get(this.uri) ?? 1); files.delete(this.uri); this.uri = to.uri }
  }
  class Directory {
    uri: string
    constructor(_: unknown, name: string) { this.uri = `/docs/${name}` }
    create() {}
  }
  class DownloadTask {
    constructor(private url: string, private to: File, private o: { onProgress: (p: { bytesWritten: number; totalBytes: number }) => void }) {}
    downloadAsync() {
      return new Promise<File>((resolve) => {
        tasks.push({ url: this.url, progress: this.o.onProgress, finish: () => { files.set(this.to.uri, 100); resolve(this.to) } })
      })
    }
  }
  return { File, Directory, DownloadTask, Paths: { document: '/docs' } }
})

beforeEach(() => {
  files.clear()
  tasks = []
})

describe('downloadEpisode', () => {
  it('shares one download between the episode page and the player, with progress for both', async () => {
    const { downloadEpisode } = await import('./episodeAudio')
    const page: number[] = []
    const player: number[] = []
    const a = downloadEpisode('ep', 'https://x.test/ep.mp3', (p) => page.push(p))
    const b = downloadEpisode('ep', 'https://x.test/ep.mp3', (p) => player.push(p))
    expect(tasks).toHaveLength(1)
    tasks[0]!.progress({ bytesWritten: 50, totalBytes: 100 })
    expect(page.at(-1)).toBe(0.5)
    expect(player.at(-1)).toBe(0.5)
    tasks[0]!.finish()
    expect(await a).toBe(await b)
  })

  it('a player joining late starts from the progress so far', async () => {
    const { downloadEpisode } = await import('./episodeAudio')
    void downloadEpisode('ep2', 'https://x.test/ep2.mp3', () => {})
    tasks[0]!.progress({ bytesWritten: 30, totalBytes: 100 })
    const late: number[] = []
    const b = downloadEpisode('ep2', 'https://x.test/ep2.mp3', (p) => late.push(p))
    expect(late[0]).toBe(0.3)
    tasks[0]!.finish()
    await b
  })

  it('stopping one listener leaves the shared download running', async () => {
    const { downloadEpisode } = await import('./episodeAudio')
    const abort = new AbortController()
    const first: number[] = []
    void downloadEpisode('ep3', 'https://x.test/ep3.mp3', (p) => first.push(p), abort.signal).catch(() => {})
    const b = downloadEpisode('ep3', 'https://x.test/ep3.mp3', () => {})
    abort.abort()
    tasks[0]!.progress({ bytesWritten: 80, totalBytes: 100 })
    expect(first.at(-1)).toBe(0)
    tasks[0]!.finish()
    expect(await b).toContain('ep3.mp3')
  })
})
