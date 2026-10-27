import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildLabel, groupChangelog, hasUnread, newestDate, parseChangelog, REVIEW_NOTES_MAX, reviewNotes, type ChangelogEntry } from '../src/changelog'

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

describe('Notes for App Review from the change log (PC-1022-06)', () => {
  const e = (id: string, date: string, kind: ChangelogEntry['kind'], extra: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
    id,
    date,
    kind,
    title: `Title ${id}`,
    description: `What ${id} does.`,
    ...extra,
  })
  const log = [e('A', '2026-10-20', 'Feature', { tryIt: 'Open Discover' }), e('B', '2026-10-22', 'Bug'), e('C', '2026-10-23', 'UX')]

  it('describes every change since the last approved version, over-the-air ones included', () => {
    const text = reviewNotes(log, '2026-10-20')
    expect(text).toContain('since the last approved version (2026-10-20)')
    expect(text).toContain('over-the-air update')
    expect(text).not.toContain('Title A')
    expect(text).toContain('New and changed:\n- Title C: What C does.')
    expect(text).toContain('Fixes and refinements:\n- Title B: What B does.')
    expect(reviewNotes(log)).toContain('- Title A: What A does. (Try it: Open Discover.)')
    expect(reviewNotes(log, '2026-10-23')).toMatch(/^No changes since the last approved version./)
    expect(reviewNotes(log, '2026-10-23', undefined, '')).toBe('No changes since the last approved version.')
  })

  it('always fits the box and never leaves a change out', () => {
    const many = Array.from({ length: 80 }, (_, i) => e(`X${i}`, '2026-10-21', i % 2 ? 'Bug' : 'Feature', { description: 'x'.repeat(120) }))
    const text = reviewNotes(many)
    expect(text.length).toBeLessThanOrEqual(REVIEW_NOTES_MAX)
    for (const m of many) expect(text).toContain(`- Title ${m.id}`)
  })

  it('reads the real change log within the limit', async () => {
    const entries = parseChangelog(JSON.parse(readFileSync(new URL('../../../server/changelog.json', import.meta.url), 'utf8')))
    expect(reviewNotes(entries).length).toBeLessThanOrEqual(REVIEW_NOTES_MAX)
  })
})
