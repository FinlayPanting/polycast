import { LAUNCH_LANGUAGES, withoutLanguageMarks } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { silentWav } from '../src/audio'
import { memoryLedger, SpendGuard } from '../src/budget'
import { memoryStorage } from '../src/providers/mock'
import type { SpeechSynth } from '../src/providers/types'
import { ensureWelcomeAudio, voiceWelcome, WELCOME_SCRIPTS, welcomeManifestPath, type WelcomeManifest } from '../src/welcome'

function speech(failTarget = false) {
  const calls: { text: string; language: string; rate?: number }[] = []
  const s: SpeechSynth = {
    async synthesize({ text, language, rate }) {
      calls.push({ text, language, rate })
      if (failTarget && language !== 'en') throw Object.assign(new Error('no voice'), { retryable: false })
      return { audio: silentWav(1, 8000), mimeType: 'audio/mp4', durationSec: text.length / 15, usage: { ttsChars: text.length } }
    },
  }
  return { s, calls }
}

describe('guide welcome', () => {
  it('has a script for every launch language, in British English, with at least one target-language word', () => {
    for (const lang of LAUNCH_LANGUAGES) {
      const script = WELCOME_SCRIPTS[lang]
      expect(script).toMatch(/\[\[[^\]]+\]\]/)
      expect(script).toContain("I'm Mia")
      // About 20–30 seconds at the guide's pace (15 characters a second).
      expect(withoutLanguageMarks(script).length / 15).toBeLessThan(30)
      expect(script).not.toMatch(/!!|amazing/i)
    }
  })

  it('reads English in the guide voice and the target words in the target language, slowly', async () => {
    const { s, calls } = speech()
    const storage = memoryStorage()
    const ledger = memoryLedger()
    const m = await voiceWelcome('sv', { speech: s, storage, guard: new SpendGuard(ledger, 5) })
    expect(calls.map((c) => c.language)).toEqual(['en', 'sv', 'en'])
    expect(calls[1]).toMatchObject({ text: 'fika', rate: 0.8 })
    expect(m.parts).toHaveLength(3)
    const stored = JSON.parse(new TextDecoder().decode(storage.files.get(welcomeManifestPath('sv'))!)) as WelcomeManifest
    expect(stored).toEqual(m)
    expect(stored.parts[0]!.url).toContain('welcome/v1/en-sv/mia-0.m4a')
    // Counted against the spending cap at its real cost.
    expect([...ledger.entries.values()][0]).toBeGreaterThan(0)
  })

  it('falls back to the guide’s own voice when the target voice fails', async () => {
    const { s, calls } = speech(true)
    const m = await voiceWelcome('de', { speech: s, storage: memoryStorage(), guard: new SpendGuard(memoryLedger(), 5) })
    expect(m.parts).toHaveLength(3)
    expect(calls.filter((c) => c.text === 'genau').map((c) => c.language)).toContain('en')
  }, 30_000)

  it('voices each language once and skips what is already stored', async () => {
    const { s, calls } = speech()
    const storage = memoryStorage()
    const guard = new SpendGuard(memoryLedger(), 5)
    expect(await ensureWelcomeAudio({ speech: s, storage, guard })).toEqual([...LAUNCH_LANGUAGES])
    const n = calls.length
    expect(await ensureWelcomeAudio({ speech: s, storage, guard })).toEqual([])
    expect(calls.length).toBe(n)
  })

  it('stops at the spending cap without voicing anything', async () => {
    const { s, calls } = speech()
    const logs: string[] = []
    const voiced = await ensureWelcomeAudio({ speech: s, storage: memoryStorage(), guard: new SpendGuard(memoryLedger(), 0), log: (m) => logs.push(m) })
    expect(voiced).toEqual([])
    expect(calls).toHaveLength(0)
    expect(logs).toHaveLength(1)
  })
})
