import { describe, expect, it } from 'vitest'
import { openrouterScribeTranscriber, wordsFromOpenRouter } from '../src/providers/openrouter'
import { compareTranscripts, timingsSurvive } from '../src/transcriptionCompare'

const words = (s: string, shift = 0) => s.split(' ').map((text, i) => ({ text, start: i * 0.4 + shift, end: i * 0.4 + 0.3 + shift }))

describe('comparing two transcripts of the same clip', () => {
  it('passes when words and timings agree', () => {
    const c = compareTranscripts(words('Hej och välkommen till Alex och Sigges podcast'), words('hej och välkommen till Alex och Sigges podcast', 0.02))
    expect(c.matchedShare).toBe(1)
    expect(c.medianStartDiffSec).toBeCloseTo(0.02)
    expect(timingsSurvive(c)).toBe(true)
  })

  it('fails when timings drift, and lists names only one side caught', () => {
    const c = compareTranscripts(words('i dag pratar vi med Sigge om Malmö'), words('i dag pratar vi med sigge om Malmö', 0.5))
    expect(c.namesOnlyInA).toEqual(['Sigge'])
    expect(c.namesOnlyInB).toEqual([])
    expect(timingsSurvive(c)).toBe(false)
  })
})

describe('Scribe through OpenRouter', () => {
  it('sends the clip as base64 and reads word timings and cost', async () => {
    let sent: any
    const f = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return Response.json({ language: 'sv', words: [{ word: 'Hej', start: 0.1, end: 0.4 }, { word: '(skratt)', start: 0.5, end: 0.9 }, { word: 'du', start: 1, end: 1.2 }], usage: { seconds: 2, cost: 0.0001 } })
    }) as any
    const t = openrouterScribeTranscriber('k', f)
    const out = await t.transcribe({ audioUrl: 'https://a/x.mp3', language: 'sv', durationSec: 2, audio: new Uint8Array([1, 2, 3]) })
    expect(sent).toMatchObject({ model: 'elevenlabs/scribe-v2', input_audio: { data: 'AQID', format: 'mp3' }, response_format: 'verbose_json' })
    expect(out.words.map((w) => w.text)).toEqual(['Hej', 'du'])
    expect(t.lastCostUSD).toBe(0.0001)
  })

  it('accepts words given as text too', () => {
    expect(wordsFromOpenRouter([{ text: ' Tack ', start: 0, end: 1 }])).toEqual([{ text: 'Tack', start: 0, end: 1, speaker: undefined }])
  })
})
