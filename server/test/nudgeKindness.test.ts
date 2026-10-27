import { readdirSync, readFileSync } from 'node:fs'
import { unkindReasons } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { allNotificationLines, READY_PUSH_TITLE } from '../src/nudges'

// PC-1026-07: coming back is an invitation, never a telling-off.
describe('every notification is kind', () => {
  const lines = allNotificationLines()

  it('covers the ready push and every nudge, from both guides', () => {
    expect(lines).toContain(READY_PUSH_TITLE)
    expect(lines.some((l) => l.startsWith('Mia: '))).toBe(true)
    expect(lines.some((l) => l.startsWith('Leo: '))).toBe(true)
    expect(lines.length).toBeGreaterThanOrEqual(8)
  })

  it.each(allNotificationLines())('“%s” never guilt-trips', (line) => {
    expect(unkindReasons(line)).toEqual([])
  })

  it('sends pushes only from places the check knows about', () => {
    const dir = new URL('../src/', import.meta.url)
    const senders = readdirSync(dir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => readFileSync(new URL(f, dir), 'utf8').includes('exp.host/--/api/v2/push/send'))
    // main.ts sends READY_PUSH_TITLE and the nudges' own text; a new sender must add its lines to allNotificationLines.
    expect(senders).toEqual(['main.ts'])
    expect(readFileSync(new URL('main.ts', dir), 'utf8')).not.toMatch(/title: '[^']+'/)
  })
})
