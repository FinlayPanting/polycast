import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// PC-1026-02: the Plus screen on both iPhone Duo displays.
describe('Plus screen layout', () => {
  const source = readFileSync(new URL('../app/plus.tsx', import.meta.url), 'utf8')

  it('keeps "Not now" outside the scroll, so the way out never moves', () => {
    expect(source.indexOf('label="Not now"')).toBeGreaterThan(-1)
    expect(source.indexOf('label="Not now"')).toBeLessThan(source.indexOf('<ScrollView'))
  })

  it('caps the text column and the buy buttons', () => {
    expect(source).toMatch(/maxWidth: PLUS_TEXT_MAX/)
    expect(source).toMatch(/maxWidth: PLUS_BUTTON_MAX/)
  })

  it('keeps the renewal terms, restore, terms and privacy in both footers', () => {
    for (const s of ['Renews automatically', 'Restore purchases', 'label="Terms"', 'label="Privacy"']) expect(source).toContain(s)
  })
})
