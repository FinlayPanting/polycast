import { describe, expect, it } from 'vitest'
import { continueRoute, newestEpisodeRoute, parseShortcut, shortcutShows } from './shortcutsCore'

const id = '0b6f3c1e-2a4d-4b8e-9f00-1234567890ab'

describe('Siri and Spotlight shortcuts (PC-1021-09)', () => {
  it('reads the note the shortcut leaves, and ignores anything else', () => {
    expect(parseShortcut('continue')).toEqual({ kind: 'continue' })
    expect(parseShortcut(`show:${id}`)).toEqual({ kind: 'show', podcastId: id })
    expect(parseShortcut('show:../../etc')).toBeUndefined()
    expect(parseShortcut(null)).toBeUndefined()
    expect(parseShortcut('')).toBeUndefined()
  })

  it('carries on the last listen the way it was heard, or opens the Library when there is none', () => {
    const last = { id, title: 'T', podcastTitle: 'P', image: null, durationSec: 60 }
    expect(continueRoute(last)).toEqual({ pathname: '/listen/[id]', params: { id, guide: '1' } })
    expect(continueRoute({ ...last, guide: '0' })).toEqual({ pathname: '/listen/[id]', params: { id, guide: '0' } })
    expect(continueRoute({ ...last, level: 'light' })).toEqual({ pathname: '/listen/[id]', params: { id, guide: '1', level: 'light' } })
    expect(continueRoute(undefined)).toEqual({ pathname: '/library' })
  })

  it('plays the newest episode if it’s ready, else opens its page, and never prepares one on its own', () => {
    const eps = [
      { id: 'old', status: 'ready', published: '2026-10-01T00:00:00Z' },
      { id: 'new', status: 'ready', published: '2026-10-20T00:00:00Z' },
    ]
    expect(newestEpisodeRoute(id, eps)).toEqual({ pathname: '/listen/[id]', params: { id: 'new', guide: '1' } })
    expect(newestEpisodeRoute(id, [...eps, { id: 'newer', status: 'none', published: '2026-10-21T00:00:00Z' }])).toEqual({ pathname: '/episode/[id]', params: { id: 'newer' } })
    expect(newestEpisodeRoute(id, [])).toEqual({ pathname: '/show', params: { podcastId: id } })
  })

  it('offers the followed shows by name', () => {
    expect(shortcutShows([{ podcastId: id, title: 'Coffee Break Spanish' }])).toEqual([{ id, title: 'Coffee Break Spanish' }])
  })
})

describe('the shortcuts build (PC-1021-09)', () => {
  it('builds the App Shortcuts into the app, using the same notes as the native module', async () => {
    const { readFileSync } = await import('node:fs')
    const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    expect(JSON.parse(read('app.json')).expo.plugins).toContain('./plugins/withAppShortcuts')
    const shortcuts = read('native/PolycastShortcuts.swift')
    const mod = read('modules/polycast-shortcuts/ios/PolycastShortcutsModule.swift')
    for (const key of ['polycast.shortcuts.shows', 'polycast.shortcuts.pending', 'PolycastShortcut"']) {
      expect(shortcuts, key).toContain(key)
      expect(mod, key).toContain(key)
    }
    // Every phrase names the app, as Siri requires.
    for (const phrase of shortcuts.match(/^\s+"[^"]*\\\(\.applicationName\)"?,?$/gm) ?? []) expect(phrase).toContain('applicationName')
    expect(shortcuts.match(/\\\(\.applicationName\)/g)!.length).toBe(5)
  })

  it('compiles on the app’s iOS 15.1 minimum and tells Siri when followed shows change (PC-1022-03)', async () => {
    const { readFileSync } = await import('node:fs')
    const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    const shortcuts = read('native/PolycastShortcuts.swift')
    // Every App Intents type, and anything returning one, is marked iOS 16 and up.
    const decls = shortcuts.match(/^(struct \w+: (AppEntity|EntityQuery|AppIntent|AppShortcutsProvider)|  static func shows\(\) -> \[ShowEntity\])/gm) ?? []
    expect(decls).toHaveLength(6)
    for (const d of decls) expect(shortcuts).toContain(`@available(iOS 16.0, *)\n${d}`)
    expect(shortcuts).toContain('@objc(PolycastShortcutsRefresher)')
    expect(shortcuts).toMatch(/if #available\(iOS 16\.0, \*\) \{\s+PolycastAppShortcuts\.updateAppShortcutParameters\(\)/)
    const mod = read('modules/polycast-shortcuts/ios/PolycastShortcutsModule.swift')
    expect(mod).toContain('NSClassFromString("PolycastShortcutsRefresher")')
    expect(mod).toContain('NSSelectorFromString("refresh")')
  })
})
