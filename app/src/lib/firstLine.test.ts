import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareToBudget, FORWARD, screenKey } from '../../scripts/first-line.mjs'

describe('counting the steps to Mia’s first line (PC-1028-07)', () => {
  const budget = JSON.parse(readFileSync(join(__dirname, '../../first-line.json'), 'utf8'))

  it('has a budget for screens, taps and typed fields', () => {
    for (const k of ['screens', 'taps', 'typed']) expect(Number.isInteger(budget[k]) && budget[k] > 0).toBe(true)
  })

  it('fails when any count grows, and says when they shrink', () => {
    expect(compareToBudget({ screens: 10, taps: 10, typed: 2 }, { screens: 10, taps: 10, typed: 2 })).toEqual({ ok: true, grew: [], shrank: [] })
    const more = compareToBudget({ screens: 11, taps: 11, typed: 2 }, { screens: 10, taps: 10, typed: 2 })
    expect(more.ok).toBe(false)
    expect(more.grew).toEqual(['screens: 11, budget 10', 'taps: 11, budget 10'])
    expect(compareToBudget({ screens: 9, taps: 10, typed: 2 }, { screens: 10, taps: 10, typed: 2 })).toMatchObject({ ok: true, shrank: ['screens: 9, budget 10'] })
  })

  it('counts the email screen’s two steps as two screens', () => {
    expect(screenKey('/email', 'Sign in with email')).not.toBe(screenKey('/email', 'Check your email'))
    expect(screenKey('/onboarding/interests', 'x')).toBe('/onboarding/interests')
  })

  it('walks forward the way a new learner would, guide first', () => {
    expect(FORWARD.indexOf('Listen with Mia')).toBeLessThan(FORWARD.indexOf('Skip and play'))
    expect(FORWARD.indexOf('Skip for now')).toBeLessThan(FORWARD.indexOf('Continue'))
  })

  it('keeps the address and code on one screen, and You already know on the language screen (PC-1030-04)', () => {
    expect(budget.screens).toBeLessThanOrEqual(8)
    const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
    expect(() => src('app/onboarding/known.tsx')).toThrow()
    expect(src('app/onboarding/language.tsx')).toContain("pathname: '/onboarding/interests'")
    expect(src('app/onboarding/language.tsx')).toContain('<KnownWordsPanel')
    expect(src('app/email.tsx')).not.toContain('Check your email')
  })

  it('runs in pnpm check', () => {
    const root = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    expect(root.scripts.check).toContain('node app/scripts/first-line.mjs')
  })
})
