import { describe, expect, it } from 'vitest'
import type { Sql } from '../src/db'
import { createLab } from '../src/lab/routes'
import {
  compareTranscription,
  contextBias,
  estimateTranscribeUSD,
  namesSpelt,
  transcribePerHourUSD,
  voxtralTranscriber,
  VOXTRAL_CONTEXT_MAX,
  wordErrorRate,
  wordsFromVoxtral,
} from '../src/lab/transcribe'
import type { Transcriber } from '../src/providers/types'

const ep = { audioUrl: 'https://feed.example/ep.mp3', language: 'sv' }
const names = { showTitle: 'Svenska Samtal', hosts: ['Anna Lind', 'Erik'], names: ['Göteborg', 'Erik'] }
const fake = (text: string, detectedLanguage = 'sv'): Transcriber => ({
  async transcribe() {
    return { words: text.split(' ').map((t, i) => ({ text: t, start: i, end: i + 0.5 })), detectedLanguage, usage: { transcriptionSec: 60 } }
  },
})

describe('Transcription audition in the Lab (PC-1026-04)', () => {
  it('prices Voxtral at about a quarter of Scribe with its name hints', () => {
    expect(transcribePerHourUSD('voxtral')).toBeCloseTo(0.21, 6)
    expect(transcribePerHourUSD('scribe', new Date('2026-10-27'))).toBeCloseTo(0.22 * 1.3, 6)
    const { estimate, totalUSD } = estimateTranscribeUSD(300, new Date('2026-10-27'))
    expect(estimate[1]!.usd).toBeCloseTo(5 * 0.0035, 9)
    expect(totalUSD).toBeCloseTo(estimate[0]!.usd + estimate[1]!.usd, 9)
  })

  it('turns the show’s names into context bias: unique, trimmed, at most 100', () => {
    expect(contextBias(names)).toEqual(['Svenska Samtal', 'Anna Lind', 'Erik', 'Göteborg'])
    expect(contextBias(undefined)).toEqual([])
    expect(contextBias({ showTitle: '', hosts: [], names: Array.from({ length: 150 }, (_, i) => `Name ${i}`) })).toHaveLength(VOXTRAL_CONTEXT_MAX)
  })

  it('reads word timings, or shares a segment’s time between its words', () => {
    expect(wordsFromVoxtral({ words: [{ word: ' Hej', start: 0.1, end: 0.4 }, { word: 'då', start: 0.4, end: 0.7, speaker_id: 's1' }] })).toEqual([
      { text: 'Hej', start: 0.1, end: 0.4 },
      { text: 'då', start: 0.4, end: 0.7, speaker: 's1' },
    ])
    const w = wordsFromVoxtral({ segments: [{ text: 'Tåget är sent', start: 3, end: 6 }] })
    expect(w.map((x) => [x.text, x.start, x.end])).toEqual([
      ['Tåget', 3, 4],
      ['är', 4, 5],
      ['sent', 5, 6],
    ])
    expect(wordsFromVoxtral({ text: 'bara text' }).map((x) => x.text)).toEqual(['bara', 'text'])
    expect(wordsFromVoxtral(null)).toEqual([])
  })

  it('sends the clip, word timestamps and the names to Mistral, with no language (it can’t go with timestamps)', async () => {
    let sent: { url: string; auth?: string; form?: FormData } = { url: '' }
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, auth: (init.headers as Record<string, string>).Authorization, form: init.body as FormData }
      return new Response(JSON.stringify({ language: 'sv', words: [{ word: 'Hej', start: 0, end: 0.3 }], usage: { prompt_audio_seconds: 61 } }), { headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const r = await voxtralTranscriber('mk', f).transcribe({ audioUrl: ep.audioUrl, language: 'sv', durationSec: 60, audio: new Uint8Array([1, 2, 3]), names })
    expect(sent.url).toBe('https://api.mistral.ai/v1/audio/transcriptions')
    expect(sent.auth).toBe('Bearer mk')
    expect(sent.form!.get('model')).toBe('voxtral-mini-transcribe-3')
    expect(sent.form!.getAll('timestamp_granularities')).toEqual(['word'])
    expect(sent.form!.getAll('context_bias')).toEqual(['Svenska Samtal', 'Anna Lind', 'Erik', 'Göteborg'])
    expect(sent.form!.has('language')).toBe(false)
    expect(sent.form!.has('file')).toBe(true)
    expect(r).toEqual({ words: [{ text: 'Hej', start: 0, end: 0.3 }], detectedLanguage: 'sv', usage: { transcriptionSec: 61 } })
  })

  it('measures word error rate on normalised words', () => {
    expect(wordErrorRate(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(0)
    expect(wordErrorRate(['a', 'b', 'c', 'd'], ['a', 'x', 'c'])).toBe(0.5)
    expect(wordErrorRate([], [])).toBe(0)
    expect(wordErrorRate([], ['a'])).toBe(1)
  })

  it('checks which names are spelt exactly', () => {
    const words = 'Hej, Anna Lind! Vi åker till Goteborg.'.split(' ').map((text) => ({ text, start: 0, end: 0 }))
    expect(namesSpelt(words, ['Anna Lind', 'Göteborg'])).toEqual([
      { name: 'Anna Lind', found: true },
      { name: 'Göteborg', found: false },
    ])
  })

  it('runs both side by side, with agreement, names and cost', async () => {
    const r = await compareTranscription(ep, { mp3: new Uint8Array(), seconds: 120 }, names, {}, {
      transcribers: { scribe: fake('Hej Anna Lind vi åker till Göteborg'), voxtral: fake('Hej Anna Lind vi åker till Goteborg', 'sv') },
    })
    expect(r.map((x) => x.provider)).toEqual(['scribe', 'voxtral'])
    expect(r.every((x) => x.ok)).toBe(true)
    expect(r[0]!.agreement).toBeCloseTo(6 / 7, 3)
    expect(r[1]!.names!.find((n) => n.name === 'Göteborg')!.found).toBe(false)
    expect(r[0]!.names!.find((n) => n.name === 'Göteborg')!.found).toBe(true)
    expect(r[1]!.costUSD).toBeCloseTo(2 * 0.0035, 9)
    expect(r[1]!.detectedLanguage).toBe('sv')
  })

  it('says plainly when Mistral isn’t set up, charges nothing for it, and still runs Scribe', async () => {
    const r = await compareTranscription(ep, { mp3: new Uint8Array(), seconds: 60 }, undefined, {}, { transcribers: { scribe: fake('Hej') } })
    expect(r[0]!.ok).toBe(true)
    expect(r[1]).toMatchObject({ ok: false, costUSD: 0, error: expect.stringMatching(/MISTRAL_API_KEY/) })
    expect(r[0]!.agreement).toBeUndefined()
  })

  it('estimates from the route without spending anything, and tells the page whether Voxtral is on', async () => {
    const episodeRow = {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Avsnitt 1',
      podcast_title: 'Svenska Samtal',
      audio_url: ep.audioUrl,
      language: 'sv',
      native_language: 'en',
      source: 'scribe',
      words: [],
      segments: [{ id: 's0', start: 0, end: 1800, text: 'x', wordStart: 0, wordEnd: 0 }],
      plan: { moments: [] },
      guide_id: 'mia',
    }
    const sql = (async () => [episodeRow]) as unknown as Sql
    let fetched = 0
    const app = createLab({ sql, token: 'secret', keys: {}, storage: {} as never, download: async () => (fetched++, new Uint8Array()), wrongPasswordDelayMs: 0, fetch: (async () => (fetched++, new Response('{}'))) as unknown as typeof fetch })
    const res = await app.request('/api/transcribe', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeId: episodeRow.id, minutes: 5, estimate: true }),
    })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.estimate[1].usd).toBeCloseTo(5 * 0.0035, 9)
    expect(fetched).toBe(0)
    const big = await app.request('/api/transcribe', { method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ episodeId: episodeRow.id, minutes: 600, estimate: true }) })
    expect((await big.json()).estimate[1].usd).toBeCloseTo(15 * 0.0035, 9)
  })
})
