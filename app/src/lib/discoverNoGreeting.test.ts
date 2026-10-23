import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// PC-1020-R1: Finlay reversed PC-1019-09, so Discover opens with no greeting.
describe('Discover', () => {
  it('has no time-of-day greeting', () => {
    const source = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8')
    expect(source).not.toMatch(/greeting/i)
    expect(existsSync(new URL('./greeting.ts', import.meta.url))).toBe(false)
  })
})
