import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildLabel, groupChangelog, hasUnread, newestDate, parseChangelog, type ChangelogEntry } from '../src/changelog'

const entry = (id: string, date: string, kind: ChangelogEntry['kind']): ChangelogEntry => ({ id, date, kind, title: id, description: `${id} changed` })

describe("What's new (PC-1019-F02)", () => {
  it('labels each build by its night', () => {
    expect(buildLabel('2026-10-20')).toBe('Overnight build, Tue 20 Oct')
    expect(buildLabel('2026-11-01')).toBe('Overnight build, Sun 1 Nov')
    expect(buildLabel('nonsense')).toBe('Overnight build')
  })

  it('groups newest build first, features above fixes and refinements', () => {
    const builds = groupChangelog([entry('a', '2026-10-19', 'Feature'), entry('b', '2026-10-20', 'Bug'), entry('c', '2026-10-20', 'UX'), entry('d', '2026-10-20', 'Refinement')])
    expect(builds.map((b) => b.date)).toEqual(['2026-10-20', '2026-10-19'])
    expect(builds[0]!.features.map((e) => e.id)).toEqual(['c'])
    expect(builds[0]!.fixes.map((e) => e.id)).toEqual(['b', 'd'])
  })

  it('shows the dot only for builds newer than the last one seen', () => {
    const list = [entry('a', '2026-10-19', 'Feature'), entry('b', '2026-10-20', 'Bug')]
    expect(hasUnread(list, undefined)).toBe(true)
    expect(hasUnread(list, '2026-10-19')).toBe(true)
    expect(hasUnread(list, '2026-10-20')).toBe(false)
    expect(hasUnread([], undefined)).toBe(false)
    expect(newestDate(list)).toBe('2026-10-20')
  })

  it('reads a served or cached copy safely, leaving out anything malformed', () => {
    expect(parseChangelog(null)).toEqual([])
    expect(parseChangelog({ entries: 'no' })).toEqual([])
    expect(parseChangelog({ entries: [entry('a', '2026-10-20', 'Feature'), { id: 'b' }, { ...entry('c', '20 Oct', 'Bug') }, { ...entry('d', '2026-10-20', 'Oops' as any) }] }).map((e) => e.id)).toEqual(['a'])
  })

  it("the repo's change log is well formed, with unique ids", () => {
    const raw = JSON.parse(readFileSync(new URL('../../../server/changelog.json', import.meta.url), 'utf8'))
    const entries = parseChangelog(raw)
    expect(entries.length).toBe(raw.entries.length)
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length)
    for (const e of entries) expect(e.description).not.toMatch(/!!/)
  })
})
