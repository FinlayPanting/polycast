import { PLUS_MONTHLY_SEC } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { autoDownloadHint, autoDownloadPlan, connectionAllows, type AutoDownloadInput } from './autoDownloadCore'
import type { NewEpisode } from './libraryCore'

const ep = (id: string, podcastId: string, published: string, ready = true, durationSec = 1800): NewEpisode => ({
  episodeId: id, title: id, podcastId, podcastTitle: podcastId, image: null, durationSec, published, ready,
})

const base: AutoDownloadInput = {
  episodes: [ep('a1', 'A', '2026-10-20T08:00:00Z'), ep('b1', 'B', '2026-10-20T09:00:00Z')],
  shows: [{ podcastId: 'A', since: '2026-10-19T00:00:00Z' }],
  saved: new Set(),
  askedToPrepare: new Set(),
  connection: 'wifi',
  allowMobileData: false,
  account: { plan: 'free', plusUsedSec: 0 },
}
const ids = (es: NewEpisode[]) => es.map((e) => e.episodeId)

describe('auto-download for followed shows (PC-1017-F12)', () => {
  it('downloads new episodes only from shows the learner turned it on for', () => {
    expect(ids(autoDownloadPlan(base).download)).toEqual(['a1'])
    expect(ids(autoDownloadPlan({ ...base, shows: [] }).download)).toEqual([])
  })

  it('leaves out episodes published before it was turned on, and ones already on the phone', () => {
    const episodes = [ep('old', 'A', '2026-10-18T08:00:00Z'), ep('a1', 'A', '2026-10-20T08:00:00Z'), ep('a2', 'A', '2026-10-21T08:00:00Z')]
    expect(ids(autoDownloadPlan({ ...base, episodes, saved: new Set(['a1']) }).download)).toEqual(['a2'])
  })

  it('is Wi-Fi only unless mobile data is allowed, and does nothing offline', () => {
    expect(autoDownloadPlan({ ...base, connection: 'cellular' }).download).toEqual([])
    expect(ids(autoDownloadPlan({ ...base, connection: 'cellular', allowMobileData: true }).download)).toEqual(['a1'])
    expect(autoDownloadPlan({ ...base, connection: 'none', allowMobileData: true }).download).toEqual([])
    expect(autoDownloadPlan({ ...base, connection: 'unknown', allowMobileData: true }).download).toEqual([])
    expect(connectionAllows('wifi', false)).toBe(true)
  })

  it('never prepares on the free plan: an episode that isn’t ready waits', () => {
    const plan = autoDownloadPlan({ ...base, episodes: [ep('a1', 'A', '2026-10-20T08:00:00Z', false)] })
    expect(plan).toEqual({ download: [], prepare: [] })
    expect(autoDownloadPlan({ ...base, account: null, episodes: [ep('a1', 'A', '2026-10-20T08:00:00Z', false)] }).prepare).toEqual([])
  })

  it('prepares for Plus within the month’s hours, once per episode', () => {
    const episodes = [ep('a1', 'A', '2026-10-20T08:00:00Z', false, 3600), ep('a2', 'A', '2026-10-20T09:00:00Z', false, 3600)]
    const plus = { plan: 'plus' as const, plusUsedSec: PLUS_MONTHLY_SEC - 5400 }
    expect(ids(autoDownloadPlan({ ...base, episodes, account: plus }).prepare)).toEqual(['a1'])
    expect(ids(autoDownloadPlan({ ...base, episodes, account: plus, askedToPrepare: new Set(['a1']) }).prepare)).toEqual(['a2'])
    expect(autoDownloadPlan({ ...base, episodes, account: { plan: 'plus', plusUsedSec: PLUS_MONTHLY_SEC } }).prepare).toEqual([])
  })

  it('takes a few at a time, oldest first', () => {
    const episodes = ['05', '01', '04', '02', '03'].map((d) => ep(`a${d}`, 'A', `2026-10-${d === '01' ? '20T01' : `20T${d}`}:00:00Z`))
    expect(ids(autoDownloadPlan({ ...base, episodes }).download)).toEqual(['a01', 'a02', 'a03'])
  })

  it('says what will happen in plain words', () => {
    expect(autoDownloadHint('free', false)).toBe('New episodes download on Wi-Fi when you open your Library, once they’re ready.')
    expect(autoDownloadHint('plus', true)).toMatch(/Wi-Fi or mobile data.*Plus hours/)
  })
})
