import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = new Map<string, number>()
const modified = new Map<string, number>()
const excluded: string[] = []
let tasks: { url: string; headers?: Record<string, string>; progress: (p: { bytesWritten: number; totalBytes: number }) => void; finish: () => void }[] = []

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('../../modules/polycast-fingerprint', () => ({ PolycastFingerprint: { fingerprint: async () => '', excludeFromBackup: (uri: string) => (excluded.push(uri), true) } }))
vi.mock('expo-file-system', () => {
  class File {
    uri: string
    constructor(dir: { uri: string } | string, name?: string) {
      this.uri = typeof dir === 'string' ? dir : `${dir.uri}/${name}`
    }
    get exists() { return files.has(this.uri) }
    get size() { return files.get(this.uri) ?? 0 }
    get name() { return this.uri.slice(this.uri.lastIndexOf('/') + 1) }
    get lastModified() { return modified.get(this.uri) ?? Date.now() }
    delete() { files.delete(this.uri) }
    write() { files.set(this.uri, 1) }
    textSync() { return '' }
    async move(to: File) { files.set(to.uri, files.get(this.uri) ?? 1); files.delete(this.uri); this.uri = to.uri }
  }
  class Directory {
    uri: string
    constructor(_: unknown, name: string) { this.uri = `/docs/${name}` }
    create() {}
    get exists() { return [...files.keys()].some((k) => k.startsWith(`${this.uri}/`)) }
    delete() { for (const k of [...files.keys()]) if (k.startsWith(`${this.uri}/`)) files.delete(k) }
    list() { return [...files.keys()].filter((k) => k.startsWith(`${this.uri}/`)).map((k) => new File(k)) }
  }
  class DownloadTask {
    constructor(private url: string, private to: File, private o: { headers?: Record<string, string>; onProgress: (p: { bytesWritten: number; totalBytes: number }) => void }) {}
    downloadAsync() {
      return new Promise<File>((resolve) => {
        tasks.push({ url: this.url, headers: this.o.headers, progress: this.o.onProgress, finish: () => { files.set(this.to.uri, 100); resolve(this.to) } })
      })
    }
  }
  return { File, Directory, DownloadTask, Paths: { document: '/docs' } }
})

beforeEach(() => {
  files.clear()
  modified.clear()
  excluded.length = 0
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

  it('names Polycast to the host, so the listen counts in the show’s stats', async () => {
    const { downloadEpisode } = await import('./episodeAudio')
    void downloadEpisode('ep-ua', 'https://x.test/ep-ua.mp3', () => {})
    expect(tasks[0]!.headers).toEqual({ 'User-Agent': 'Polycast/1.0 (+https://polycast.app)' })
    tasks[0]!.finish()
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

  it('keeps the downloads folder out of iCloud backup', async () => {
    const { downloadEpisode } = await import('./episodeAudio')
    const done = downloadEpisode('ep5', 'https://x.test/ep5.mp3', () => {})
    tasks[0]!.finish()
    await done
    expect(excluded).toEqual(['/docs/episodes'])
  })

  it('tidies downloads untouched for 30 days unless a saved word needs them, and reports the space used', async () => {
    const { downloadsSize, tidyDownloads } = await import('./episodeAudio')
    const old = '11111111-1111-4111-8111-111111111111'
    const needed = '22222222-2222-4222-8222-222222222222'
    const recent = '33333333-3333-4333-8333-333333333333'
    const now = Date.parse('2026-10-16T12:00:00Z')
    for (const [id, daysAgo] of [[old, 40], [needed, 40], [recent, 3]] as const) {
      files.set(`/docs/episodes/${id}.mp3`, 50_000_000)
      modified.set(`/docs/episodes/${id}.mp3`, now - daysAgo * 86_400_000)
    }
    expect(downloadsSize()).toBe(150_000_000)
    expect(tidyDownloads(new Set([needed]), now)).toEqual([old])
    expect([...files.keys()].sort()).toEqual([`/docs/episodes/${needed}.mp3`, `/docs/episodes/${recent}.mp3`])
  })

  it('plays a saved word’s clip only from the copy it was timed on', async () => {
    const { clipAudio } = await import('./episodeAudio')
    files.set('/docs/episodes/ep6.mp3', 10)
    expect(clipAudio('ep6', 'https://x.test/ep6.mp3')).toBe('/docs/episodes/ep6.mp3')
    expect(clipAudio('ep7', 'https://x.test/ep7.mp3')).toBeUndefined()
  })

  it('clears every download', async () => {
    const { clearAllDownloads, downloadsSize } = await import('./episodeAudio')
    files.set('/docs/episodes/ep8.mp3', 10)
    clearAllDownloads()
    expect(downloadsSize()).toBe(0)
  })
})
