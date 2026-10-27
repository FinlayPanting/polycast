import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The store build has nothing hidden or dormant a reviewer could reach (PC-1018-05, guideline 2.5.19):
 * no demo mode, no test-only tools. Demo mode is only for web previews and screenshots.
 */
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const eas = JSON.parse(read('eas.json'))
const app = JSON.parse(read('app.json')).expo

/** A build profile's env with everything it extends. */
function envOf(profile: string): Record<string, string> {
  const p = eas.build[profile]
  return { ...(p.extends ? envOf(p.extends) : {}), ...(p.env ?? {}) }
}

describe('the App Store build', () => {
  it('never turns on demo mode', () => {
    const env = envOf('production')
    expect(env.EXPO_PUBLIC_DEMO ?? '0').not.toBe('1')
    expect(env.EXPO_PUBLIC_DEMO_SIGNED_OUT ?? '0').not.toBe('1')
    expect(env.EXPO_PUBLIC_API_URL).toMatch(/^https:\/\//)
  })

  it('never turns on demo mode in an over-the-air update either', () => {
    expect(read('.eas/workflows/update.yml')).not.toMatch(/EXPO_PUBLIC_DEMO/)
  })

  it('has no test-build tools switched on', () => {
    expect(app.extra?.testBuild).toBeUndefined()
    // The playback-log button is only for the personal-team test build (app.config.js).
    expect(read('app.config.js')).toMatch(/POLYCAST_PERSONAL_TEAM !== '1'\) return config/)
    expect(read('src/app/(tabs)/you.tsx')).toMatch(/extra\?\.testBuild \? \(\s*<Button kind="secondary" label="Share playback log"/)
  })

  it('reads demo mode only from the build-time setting', () => {
    expect(read('src/lib/config.ts')).toMatch(/demo: process\.env\.EXPO_PUBLIC_DEMO === '1'/)
  })
})

describe('the App Review notes', () => {
  const notes = readFileSync(new URL('../../../docs/APP_STORE.md', import.meta.url), 'utf8')
  it('name the features a reviewer might stumble on and Mia’s safeguards', () => {
    for (const s of ['own API keys', 'mood', 'Download for offline', 'one episode a week', 'never invents', 'polycast.app/creators', 'no hidden screens']) expect(notes).toContain(s)
  })
})

describe('the build image (PC-1019-05)', () => {
  it('stays on Xcode 26.6 so the iPhone Duo shows Polycast as a phone-shaped window', () => {
    // Apps built with the iOS 27 SDK (Xcode 27) become resizable on the iPhone Duo and may lose the portrait lock.
    // Every profile extends base, so they all build on this image until the app is laid out for any shape.
    expect(eas.build.base.ios.image).toBe('macos-tahoe-26.5-xcode-26.6')
    for (const [name, p] of Object.entries(eas.build) as [string, { extends?: string; ios?: { image?: string } }][]) {
      if (name === 'base') continue
      expect(p.extends).toBe('base')
      expect(p.ios?.image).toBeUndefined()
    }
    expect(app.orientation).toBe('portrait')
    expect(app.ios.supportsTablet).toBe(false)
  })
})
