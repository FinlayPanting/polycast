import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TABS } from './bottomBar'

const SRC = join(__dirname, '..')
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

describe('AI in Polycast looks like the guide, not a sparkle (PC-1028-03)', () => {
  it('no screen draws the generic sparkles symbol', () => {
    const offenders = sources(SRC).filter((p) => /["']sparkles?["']/.test(readFileSync(p, 'utf8')))
    expect(offenders.map((p) => p.slice(SRC.length + 1))).toEqual([])
  })

  it('Discover has its own icon', () => {
    expect(TABS.find((t) => t.id === 'index')?.icon).toBe('safari')
  })

  it('the search bar’s guide button shows the guide’s mark and says “Ask Mia” (or Leo)', () => {
    const mood = readFileSync(join(SRC, 'components/MoodPicks.tsx'), 'utf8')
    expect(mood).toContain('Ask {guideName}')
    expect(mood).toMatch(/<Mark height=\{14\} flagId=\{flagId\}/)
  })
})
