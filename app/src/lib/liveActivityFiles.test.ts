import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

describe('the lock-screen line build (PC-1020-L1)', () => {
  it('the app and the widget agree on the Live Activity type, which iOS matches by name and fields', () => {
    expect(read('modules/polycast-live-activity/ios/PolycastLineAttributes.swift')).toBe(read('targets/live-line/PolycastLineAttributes.swift'))
  })
  it('turns Live Activities on and builds the widget target', () => {
    const app = JSON.parse(read('app.json')).expo
    expect(app.ios.infoPlist.NSSupportsLiveActivities).toBe(true)
    expect(app.plugins).toContain('@bacons/apple-targets')
  })
})
