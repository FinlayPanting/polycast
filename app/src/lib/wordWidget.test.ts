import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SavedWord } from '@polycast/core'
import { localDayNumber, WIDGET_GROUP, WIDGET_KEY, WIDGET_KIND, WIDGET_WORDS, widgetWords, wordFromLink, wordOfTheDay } from './wordWidgetCore'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const word = (lemma: string, sentence = `Vi sa ${lemma} i går.`): SavedWord =>
  ({ lemma, forms: [lemma], meaning: `${lemma} (meaning)`, language: 'sv', source: { episodeId: 'e', clip: { start: 1, end: 2 }, sentence }, review: {} as any }) as SavedWord

describe('a word from your shows on the Home Screen (PC-1025-08)', () => {
  it('shares the most recent words, the host’s line trimmed for a small screen', () => {
    const many = Array.from({ length: 40 }, (_, i) => word(`ord${i}`))
    const shared = widgetWords(many)
    expect(shared).toHaveLength(WIDGET_WORDS)
    expect(shared[0]).toEqual({ lemma: 'ord0', sentence: 'Vi sa ord0 i går.', meaning: 'ord0 (meaning)', language: 'sv' })
    const long = widgetWords([word('lång', 'a'.repeat(300))])[0]!
    expect(long.sentence.length).toBe(140)
    expect(long.sentence.endsWith('…')).toBe(true)
  })

  it('picks one word a day, changing at local midnight, and goes round them all', () => {
    const words = ['a', 'b', 'c']
    const morning = new Date(2026, 9, 26, 7, 0)
    const evening = new Date(2026, 9, 26, 23, 59)
    const next = new Date(2026, 9, 27, 0, 1)
    expect(wordOfTheDay(words, morning)).toBe(wordOfTheDay(words, evening))
    expect(wordOfTheDay(words, next)).not.toBe(wordOfTheDay(words, morning))
    expect(localDayNumber(next) - localDayNumber(evening)).toBe(1)
    const seen = new Set([0, 1, 2].map((d) => wordOfTheDay(words, new Date(2026, 9, 26 + d, 12))))
    expect(seen.size).toBe(3)
    expect(wordOfTheDay([], morning)).toBeUndefined()
  })

  it('opens the word the widget links to, and nothing odd', () => {
    expect(wordFromLink({ lemma: 'fika', language: 'sv' })).toEqual({ lemma: 'fika', language: 'sv' })
    expect(wordFromLink({ lemma: ['fika'], language: ['sv'] })).toEqual({ lemma: 'fika', language: 'sv' })
    expect(wordFromLink({ lemma: 'fika' })).toBeUndefined()
    expect(wordFromLink({ lemma: 'fika', language: 'Swedish' })).toBeUndefined()
    expect(wordFromLink({ lemma: 'x'.repeat(81), language: 'sv' })).toBeUndefined()
  })

  it('the app and the widget agree on the App Group, key, kind, link and daily pick', () => {
    const swift = read('targets/word-widget/WordWidget.swift')
    expect(swift).toContain(`let appGroup = "${WIDGET_GROUP}"`)
    expect(swift).toContain(`let wordsKey = "${WIDGET_KEY}"`)
    expect(swift).toContain(`kind: "${WIDGET_KIND}"`)
    expect(swift).toContain('c.host = "word"')
    expect(swift).toContain('localDayNumber(date) % words.count')
    const app = JSON.parse(read('app.json')).expo
    expect(app.scheme).toBe('polycast')
    expect(app.ios.entitlements['com.apple.security.application-groups']).toEqual([WIDGET_GROUP])
    expect(app.plugins).toContain('@bacons/apple-targets')
    expect(read('targets/word-widget/expo-target.config.js')).toContain("bundleIdentifier: '.wordwidget'")
  })

  it('leaves the widget and its App Group out of the free-account test build', () => {
    const before = { ...process.env }
    process.env.POLYCAST_PERSONAL_TEAM = '1'
    try {
      const make = require('../../app.config.js')
      const base = JSON.parse(read('app.json')).expo
      const out = make({ config: base })
      expect(JSON.stringify(out.plugins)).not.toContain('@bacons/apple-targets')
    } finally {
      process.env = before
    }
  })
})
