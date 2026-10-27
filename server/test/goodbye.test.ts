import { LAUNCH_LANGUAGES } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { silentWav } from '../src/audio'
import { memoryLedger, SpendGuard } from '../src/budget'
import { ensureGoodbyeAudio, GOODBYE_LINES, goodbyeManifestPath, GOODNIGHT_LINES, voiceGoodbye, type GoodbyeManifest } from '../src/goodbye'
import { memoryStorage } from '../src/providers/mock'
import type { SpeechSynth } from '../src/providers/types'
import { GUIDES, guideById } from '../src/voices'

function speech() {
  const calls: { text: string; language: string; rate?: number; voice: string }[] = []
  const s: SpeechSynth = {
    async synthesize({ text, language, rate, voice }) {
      calls.push({ text, language, rate, voice })
      return { audio: silentWav(1, 8000), mimeType: 'audio/mp4', durationSec: 1.2, usage: { ttsChars: text.length } }
    },
  }
  return { s, calls }
}

describe('guide goodbye', () => {
  it('has a short line and its meaning for every launch language', () => {
    for (const lang of LAUNCH_LANGUAGES) {
      const l = GOODBYE_LINES[lang]
      expect(l.text.length).toBeLessThan(30)
      expect(l.meaning).toMatch(/^[A-Z]/)
    }
  })

  it("is read in the target language by the episode's guide, slowly, and counted against the cap", async () => {
    const { s, calls } = speech()
    const storage = memoryStorage()
    const ledger = memoryLedger()
    const m = await voiceGoodbye('sv', guideById('leo'), { speech: s, storage, guard: new SpendGuard(ledger, 5) })
    expect(calls).toEqual([{ text: 'Ha det gott!', language: 'sv', rate: 0.8, voice: guideById('leo').voice }])
    const stored = JSON.parse(new TextDecoder().decode(storage.files.get(goodbyeManifestPath('sv', { id: 'leo' }))!)) as GoodbyeManifest
    expect(stored).toEqual(m)
    expect(stored).toMatchObject({ text: 'Ha det gott!', meaning: 'Take care!', guideId: 'leo' })
    expect(stored.url).toContain('goodbye/v2/sv/leo.m4a')
    expect([...ledger.entries.values()][0]).toBeGreaterThan(0)
  })

  it('voices each language and guide once, and skips what is already stored', async () => {
    const { s, calls } = speech()
    const storage = memoryStorage()
    const guard = new SpendGuard(memoryLedger(), 5)
    expect(await ensureGoodbyeAudio({ speech: s, storage, guard })).toHaveLength(LAUNCH_LANGUAGES.length * GUIDES.length * 2)
    const n = calls.length
    expect(await ensureGoodbyeAudio({ speech: s, storage, guard })).toEqual([])
    expect(calls).toHaveLength(n)
  })

  it('stops at the spending cap', async () => {
    const { s, calls } = speech()
    expect(await ensureGoodbyeAudio({ speech: s, storage: memoryStorage(), guard: new SpendGuard(memoryLedger(), 0) })).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('has a goodnight for every launch language too, voiced beside the goodbye without touching it (PC-1025-06)', async () => {
    for (const lang of LAUNCH_LANGUAGES) {
      expect(GOODNIGHT_LINES[lang].text.length).toBeLessThan(30)
      expect(GOODNIGHT_LINES[lang].text).not.toBe(GOODBYE_LINES[lang].text)
    }
    const { s, calls } = speech()
    const storage = memoryStorage()
    const guard = new SpendGuard(memoryLedger(), 5)
    // The goodbyes are already there, as in production: only the twelve goodnights are voiced.
    for (const guide of GUIDES) for (const lang of LAUNCH_LANGUAGES) await voiceGoodbye(lang, guide, { speech: s, storage, guard })
    const before = calls.length
    const voiced = await ensureGoodbyeAudio({ speech: s, storage, guard })
    expect(voiced).toHaveLength(LAUNCH_LANGUAGES.length * GUIDES.length)
    expect(voiced).toContain('it/mia-night')
    expect(calls.slice(before).map((c) => c.text)).toContain('Sogni d’oro!')
    const night = JSON.parse(new TextDecoder().decode(storage.files.get(goodbyeManifestPath('de', { id: 'leo' }, 'goodnight'))!)) as GoodbyeManifest
    expect(night).toMatchObject({ text: 'Schlaf gut!', meaning: 'Sleep well!', guideId: 'leo' })
    expect(night.url).toContain('goodbye/v2/de/leo-night.m4a')
    expect(goodbyeManifestPath('de', { id: 'leo' }, 'goodnight')).toBe('goodbye/v2/de/leo-night.json')
  })
})
