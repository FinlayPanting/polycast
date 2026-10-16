import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REAL_HOST_LINE } from './copy'

describe('real host, real show', () => {
  it('says the same line in onboarding and the App Store description', () => {
    const store = readFileSync(join(__dirname, '../../../docs/APP_STORE.md'), 'utf8')
    expect(store).toContain(REAL_HOST_LINE)
    expect(readFileSync(join(__dirname, '../app/welcome.tsx'), 'utf8')).toContain('REAL_HOST_LINE')
  })
})
