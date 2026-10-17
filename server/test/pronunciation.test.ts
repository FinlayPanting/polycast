import { LAUNCH_LANGUAGES } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { memoryLedger, SpendGuard } from '../src/budget'
import { mockSpeech } from '../src/providers/mock'
import { PRONUNCIATION_LINES, runPronunciationCheck } from '../src/pronunciation'
import { GUIDES } from '../src/voices'

describe('pronunciation check', () => {
  it('covers English and every launch language, with target words inside English sentences', () => {
    const langs = new Set(PRONUNCIATION_LINES.map((l) => l.language))
    for (const l of ['en', ...LAUNCH_LANGUAGES]) expect(langs.has(l), l).toBe(true)
    for (const l of PRONUNCIATION_LINES.filter((l) => l.language !== 'en')) expect(l.line).toMatch(/\[\[[^\]]+\]\]/)
  })

  it('voices every line for each guide the way lessons are voiced, within its spending limit', async () => {
    const files: string[] = []
    const calls: { mixed?: boolean; language: string }[] = []
    const base = mockSpeech()
    const speech = { mixedLanguage: true, synthesize: (r: Parameters<typeof base.synthesize>[0]) => (calls.push({ mixed: r.mixed, language: r.language }), base.synthesize(r)) }
    const ledger = memoryLedger()
    const takes = await runPronunciationCheck({ speech, save: async (f) => void files.push(f), guard: new SpendGuard(ledger, 1) })
    expect(new Set(takes.map((t) => t.guide))).toEqual(new Set(GUIDES.map((g) => g.id)))
    expect(files).toHaveLength(takes.length)
    // Mixed lines go as one call; only a term said on its own is pinned to its language.
    expect(calls.filter((c) => !c.mixed).every((c) => c.language !== 'en')).toBe(true)
    expect(takes.some((t) => t.text === 'Swedes call a coffee break fika, and they take it very seriously.')).toBe(true)
    expect(takes.some((t) => t.text === 'försenad' && t.language === 'sv')).toBe(true)
  })
})
