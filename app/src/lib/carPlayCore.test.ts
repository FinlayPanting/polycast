import { describe, expect, it } from 'vitest'
import { CARPLAY_MAX_SHOWS, CARPLAY_NOT_READY, carPlayItems, carPlayShowOutcome } from './carPlayCore'

const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
const last = { id: 'ep1', title: 'Fika', podcastTitle: 'Alex & Sigges', image: null, durationSec: 1800 }

describe('CarPlay (PC-1022-10)', () => {
  it('lists Carry on first, then the followed shows', () => {
    expect(carPlayItems(last, [{ podcastId: id, title: 'Coffee Break Spanish' }])).toEqual([
      { id: 'continue', title: 'Carry on', detail: 'Fika · Alex & Sigges' },
      { id: `show:${id}`, title: 'Coffee Break Spanish' },
    ])
    expect(carPlayItems(undefined, [])).toEqual([])
  })

  it('keeps the list short enough to use while driving', () => {
    const shows = Array.from({ length: 30 }, (_, i) => ({ podcastId: `${i}`, title: `Show ${i}` }))
    expect(carPlayItems(undefined, shows)).toHaveLength(CARPLAY_MAX_SHOWS)
  })

  it('plays the newest ready episode of a show, and never opens a page the driver can’t see', () => {
    const eps = [
      { id: 'new', status: 'none', published: '2026-10-22' },
      { id: 'old', status: 'ready', published: '2026-10-15' },
    ]
    expect(carPlayShowOutcome(id, eps)).toEqual({ play: { pathname: '/listen/[id]', params: { id: 'old', guide: '1' } } })
    expect(carPlayShowOutcome(id, [{ ...eps[1]!, id: 'newer', published: '2026-10-23' }, ...eps])).toEqual({
      play: { pathname: '/listen/[id]', params: { id: 'newer', guide: '1' } },
    })
    expect(carPlayShowOutcome(id, [eps[0]!])).toEqual({ message: CARPLAY_NOT_READY })
  })
})

describe('the CarPlay build', () => {
  it('asks for the CarPlay audio entitlement and connects the car scene to the native module', async () => {
    const { readFileSync } = await import('node:fs')
    const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    expect(JSON.parse(read('app.json')).expo.plugins).toContain('./plugins/withCarPlay')
    const plugin = read('plugins/withCarPlay.js')
    expect(plugin).toContain('com.apple.developer.carplay-audio')
    const scene = read('modules/polycast-carplay/ios/PolycastCarPlaySceneDelegate.swift')
    for (const name of ['PolycastCarPlaySceneDelegate', 'PolycastPhoneSceneDelegate']) {
      expect(plugin, name).toContain(name)
      expect(scene, name).toContain(`@objc(${name})`)
    }
    const mod = read('modules/polycast-carplay/ios/PolycastCarPlayModule.swift')
    // The car scene and the module share one pod, so they share these notifications.
    for (const key of ['carPlayItemsChanged', 'carPlaySelected', 'carPlayMessage']) {
      expect(scene, key).toContain(key)
      expect(mod, key).toMatch(new RegExp(`let ${key} = Notification.Name`))
    }
    // The free-account Mac test build can't sign CarPlay.
    expect(read('app.config.js')).toContain('com.apple.developer.carplay-audio')
  })
})
