import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JavaScript script
import { liveState } from '../../scripts/live-check.mjs'
import { createApi, liveCommit } from '../src/api'

describe("'shipped' means the live server has it (PC-1029-05)", () => {
  it('reads the deployed commit from Railway, ignoring anything that is not one', () => {
    expect(liveCommit({ RAILWAY_GIT_COMMIT_SHA: 'ABCDEF1234567890abcdef1234567890abcdef12' })).toBe('abcdef1234567890abcdef1234567890abcdef12')
    expect(liveCommit({ GIT_COMMIT_SHA: 'abc1234' })).toBe('abc1234')
    expect(liveCommit({ RAILWAY_GIT_COMMIT_SHA: '' })).toBeUndefined()
    expect(liveCommit({ RAILWAY_GIT_COMMIT_SHA: 'not a sha' })).toBeUndefined()
    expect(liveCommit({})).toBeUndefined()
  })

  it('says which commit it runs in /health, still answering ok', async () => {
    const deps = { sql: {} as any, verify: async () => undefined, fetch }
    const withCommit = await (await createApi({ ...deps, commit: 'abc1234def' }).request('/health')).json()
    expect(withCommit).toEqual({ ok: true, commit: 'abc1234def' })
    const without = await (await createApi({ ...deps, commit: '' }).request('/health')).json()
    expect(without.ok).toBe(true)
  })

  it('tells a live push from an old deployment or a down server', () => {
    expect(liveState({ ok: true, commit: 'abc1234def' }, 'abc1234def5678')).toBe('live')
    expect(liveState({ ok: true, commit: 'abc1234def5678' }, 'abc1234')).toBe('live')
    expect(liveState({ ok: true, commit: '9999999aaaa' }, 'abc1234')).toBe('old 9999999')
    expect(liveState({ ok: true }, 'abc1234')).toBe('old unknown')
    expect(liveState(undefined, 'abc1234')).toBe('down')
  })
})
