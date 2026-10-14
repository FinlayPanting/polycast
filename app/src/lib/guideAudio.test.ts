import type { LessonPlan } from '@polycast/core'
import { describe, expect, it, vi } from 'vitest'

const files = new Map<string, number>()
const fetched: string[] = []

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('../../modules/polycast-fingerprint', () => ({ PolycastFingerprint: null }))
vi.mock('expo-file-system', () => {
  class File {
    uri: string
    constructor(dir: { uri: string }, name: string) { this.uri = `${dir.uri}/${name}` }
    get exists() { return files.has(this.uri) }
    get size() { return files.get(this.uri) ?? 0 }
  }
  class Directory {
    uri: string
    constructor(parent: { uri: string } | string, name: string) { this.uri = `${typeof parent === 'string' ? parent : parent.uri}/${name}` }
    create() {}
  }
  class DownloadTask {
    constructor(private url: string, private to: File) {}
    async downloadAsync() {
      fetched.push(this.url)
      if (this.url.includes('broken')) throw new Error('404')
      files.set(this.to.uri, 10)
      return this.to
    }
  }
  return { File, Directory, DownloadTask, Paths: { document: '/docs' } }
})

const plan = (urls: string[]): LessonPlan => ({
  episodeId: 'ep',
  version: 3,
  targetLanguage: 'sv',
  nativeLanguage: 'en',
  hosts: [],
  summary: '',
  wrapUpQuestions: [],
  moments: [
    {
      id: 'spot-1', kind: 'spotlight', at: 10, minLevel: 'standard', script: '', clips: [{ start: 1, end: 2 }],
      audio: { durationSec: 3, parts: [...urls.map((url) => ({ kind: 'speech' as const, url, durationSec: 1 })), { kind: 'clip' as const, clipIndex: 0 }] },
    },
  ],
})

describe('saveGuideAudio', () => {
  it('saves each guide line once and points the plan at the copies on the phone', async () => {
    const { saveGuideAudio } = await import('./episodeAudio')
    const progress: number[] = []
    const a = 'https://cdn.test/guide/ep/v3/mia/spot-1-0.m4a?token=x'
    const b = 'https://cdn.test/guide/ep/v3/mia/spot-1-1.m4a'
    const out = await saveGuideAudio('ep', plan([a, b, a]), (p) => progress.push(p))
    const urls = out.moments[0]!.audio!.parts.flatMap((p) => (p.kind === 'speech' ? [p.url] : []))
    expect(urls.every((u) => u.startsWith('/docs/episodes/ep-guide/'))).toBe(true)
    expect(fetched.filter((u) => u === a)).toHaveLength(1)
    expect(progress.at(-1)).toBe(1)
    // Second time: already on the phone, nothing fetched again.
    fetched.length = 0
    await saveGuideAudio('ep', plan([a, b]), () => {})
    expect(fetched).toEqual([])
  })

  it('keeps the web address for a line that fails to save, so the guide still speaks', async () => {
    const { saveGuideAudio } = await import('./episodeAudio')
    const broken = 'https://cdn.test/guide/ep/v3/mia/broken-0.m4a'
    const out = await saveGuideAudio('ep', plan([broken]), () => {})
    expect(out.moments[0]!.audio!.parts[0]).toMatchObject({ kind: 'speech', url: broken })
  })

  it('names files by the line and its address, so a re-voiced lesson gets fresh copies', async () => {
    const { guideFileName } = await import('./episodeAudio')
    const v3 = guideFileName('https://cdn.test/guide/ep/v3/mia/spot-1-0.m4a')
    const v4 = guideFileName('https://cdn.test/guide/ep/v4/mia/spot-1-0.m4a')
    expect(v3).not.toBe(v4)
    expect(v3.endsWith('spot-1-0.m4a')).toBe(true)
    expect(guideFileName('https://cdn.test/guide/ep/v3/mia/spot-1-0.m4a?token=a')).toBe(v3)
  })
})
