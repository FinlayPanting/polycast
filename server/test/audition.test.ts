import { pricesOn } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { silentWav } from '../src/audio'
import { AUDITION_LINES, runAudition } from '../src/audition'
import { memoryLedger, SpendCapReached, SpendGuard } from '../src/budget'
import type { SpeechSynth } from '../src/providers/types'

function speechLog() {
  const calls: { model: string; voice: string; text: string }[] = []
  const speechFor = (model: string): SpeechSynth => ({
    async synthesize({ text, voice }) {
      calls.push({ model, voice, text })
      return { audio: silentWav(1, 8000), mimeType: 'audio/mp4', durationSec: 10, usage: { ttsAudioSec: 10 } }
    },
  })
  return { calls, speechFor }
}

describe('voice audition', () => {
  it('voices the same Mia and Leo lines on Flash TTS and Flash-Lite TTS', async () => {
    const { calls, speechFor } = speechLog()
    const saved: string[] = []
    const ledger = memoryLedger()
    const { takes, summary } = await runAudition({ speechFor, save: async (f) => void saved.push(f), guard: new SpendGuard(ledger, 1), now: new Date('2026-10-15T00:00:00Z') })
    const flash = calls.filter((c) => c.model === 'gemini-3.8-flash-tts')
    const lite = calls.filter((c) => c.model === 'gemini-3.8-flash-lite-tts')
    expect(flash).toHaveLength(AUDITION_LINES.length * 2)
    expect(lite.map((c) => [c.voice, c.text])).toEqual(flash.map((c) => [c.voice, c.text]))
    expect(new Set(flash.map((c) => c.voice))).toEqual(new Set(['Sulafat', 'Achird']))
    expect(saved).toContain('01-mia-flash.m4a')
    expect(saved).toContain('01-mia-flash-lite.m4a')
    expect(takes).toHaveLength(12)
    // $9 vs $6 per million audio tokens now, doubling on 1 Jan 2027 (25 tokens a second).
    expect(summary[0]).toMatchObject({ perHourNowUSD: expect.closeTo(0.81, 4), perHour2027USD: expect.closeTo(1.62, 4) })
    expect(summary[1]).toMatchObject({ perHourNowUSD: expect.closeTo(0.54, 4), perHour2027USD: expect.closeTo(1.08, 4) })
    // Counted at what it cost: 60 s of Flash, 60 s of Lite.
    expect(ledger.entries.get('audition-flash')).toBeCloseTo(60 * pricesOn().ttsPerAudioSec, 6)
    expect(ledger.entries.get('audition-flash-lite')).toBeCloseTo(60 * pricesOn().ttsLitePerAudioSec, 6)
  })

  it('stops before voicing anything when the cap would be passed', async () => {
    const { calls, speechFor } = speechLog()
    await expect(runAudition({ speechFor, save: async () => {}, guard: new SpendGuard(memoryLedger(), 0) })).rejects.toBeInstanceOf(SpendCapReached)
    expect(calls).toHaveLength(0)
  })
})
