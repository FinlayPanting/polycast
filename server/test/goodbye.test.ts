import { LAUNCH_LANGUAGES } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { silentWav } from '../src/audio'
import { memoryLedger, SpendGuard } from '../src/budget'
import { ensureGoodbyeAudio, GOODBYE_LINES, goodbyeManifestPath, voiceGoodbye, type GoodbyeManifest } from '../src/goodbye'
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
    expect(stored.url).toContain('goodbye/v1/sv/leo.m4a')
    expect([...ledger.entries.values()][0]).toBeGreaterThan(0)
  })

  it('voices each language and guide once, and skips what is already stored', async () => {
    const { s, calls } = speech()
    const storage = memoryStorage()
    const guard = new SpendGuard(memoryLedger(), 5)
    expect(await ensureGoodbyeAudio({ speech: s, storage, guard })).toHaveLength(LAUNCH_LANGUAGES.length * GUIDES.length)
    const n = calls.length
    expect(await ensureGoodbyeAudio({ speech: s, storage, guard })).toEqual([])
    expect(calls).toHaveLength(n)
  })

  it('stops at the spending cap', async () => {
    const { s, calls } = speech()
    expect(await ensureGoodbyeAudio({ speech: s, storage: memoryStorage(), guard: new SpendGuard(memoryLedger(), 0) })).toEqual([])
    expect(calls).toHaveLength(0)
  })
})
