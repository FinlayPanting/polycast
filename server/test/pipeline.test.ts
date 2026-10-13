import { findBreaks, selectMoments } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { memoryLedger, SpendCapReached, SpendGuard } from '../src/budget'
import { assemblePlan } from '../src/pipeline/lessonPlan'
import { prepareEpisode } from '../src/pipeline/prepare'
import { splitScript } from '../src/pipeline/voice'
import { memoryStorage, mockSpeech, mockText, mockTranscriber } from '../src/providers/mock'
import { ProviderError } from '../src/providers/types'
import { DEFAULT_GUIDE } from '../src/voices'
import { draftFor, syntheticEpisode } from './fixtures'

/** Answers translation requests line by line and plan requests with the fixture draft. */
function textModel() {
  return mockText((req) => {
    if (req.prompt.includes('Translate these lines')) {
      const ids = [...req.prompt.matchAll(/^(s\d+): /gm)].map((m) => m[1]!)
      return { lines: ids.map((id) => ({ id, translation: `EN ${id}` })) }
    }
    if (req.prompt.startsWith('form | example')) {
      const forms = req.prompt.split('\n').slice(1).map((l) => l.split(' | ')[0]!)
      return { entries: forms.map((form) => ({ form, lemma: form, meaning: `means ${form}` })) }
    }
    return draftFor()
  })
}

function deps(capUSD = 5) {
  const ep = syntheticEpisode()
  const ledger = memoryLedger()
  return {
    ep,
    ledger,
    transcriber: mockTranscriber(ep.words),
    text: textModel(),
    speech: mockSpeech(),
    storage: memoryStorage(),
    guard: new SpendGuard(ledger, capUSD),
  }
}

const input = (ep: ReturnType<typeof syntheticEpisode>) => ({
  jobId: 'job1',
  episodeId: 'ep1',
  audioUrl: 'https://cdn.example.com/ep1.mp3',
  durationSec: ep.durationSec,
  language: 'sv',
  nativeLanguage: 'en',
  guide: DEFAULT_GUIDE,
})

describe('preparing an episode', () => {
  it('turns audio into subtitles, a placed lesson plan and guide audio', async () => {
    const d = deps()
    const stages: string[] = []
    const r = await prepareEpisode(input(d.ep), { ...d, onStage: (s) => void stages.push(s) })

    expect(stages).toEqual(['transcribing', 'translating', 'writing', 'voicing', 'done'])
    expect(r.transcript.segments).toHaveLength(60)
    expect(r.transcript.segments.every((s) => s.translation?.startsWith('EN '))).toBe(true)
    expect(r.transcript.glossary?.['försenad']).toEqual({ lemma: 'försenad', meaning: 'means försenad' })
    expect(r.transcript.glossary?.['grej']).toBeDefined() // punctuation stripped from "grej."

    const kinds = r.plan.moments.map((m) => m.kind)
    expect(kinds[0]).toBe('warmup')
    expect(kinds.at(-1)).toBe('wrapUp')
    expect(kinds.filter((k) => k === 'checkpoint')).toHaveLength(2) // last chapter's recap goes to the wrap-up
    expect(r.plan.wrapUpQuestions).toHaveLength(1) // the broken question is dropped

    // Every moment except the warm-up sits on a natural break.
    const breakTimes = new Set(findBreaks(r.transcript.words).map((b) => b.at))
    for (const m of r.plan.moments.filter((m) => m.kind !== 'warmup')) expect(breakTimes.has(m.at)).toBe(true)

    // Every moment is voiced; host clips sit between guide speech.
    for (const m of r.plan.moments) expect(m.audio?.parts.length).toBeGreaterThan(0)
    const spot = r.plan.moments.find((m) => m.kind === 'spotlight')!
    expect(spot.audio!.parts.map((p) => p.kind)).toEqual(['speech', 'clip', 'speech', 'clip', 'speech'])
    expect(d.storage.files.size).toBeGreaterThan(10)

    // The real cost replaced the reservation in the ledger.
    expect(d.ledger.entries.get('job1')).toBeCloseTo(r.costUSD, 6)
  })

  it('places word moments by usefulness and spacing, and drops terms the host never says', async () => {
    const d = deps()
    const r = await prepareEpisode(input(d.ep), d)
    const level = (lemma: string) => r.plan.moments.find((m) => m.kind === 'listenFor' && m.term?.lemma === lemma)?.minLevel
    expect(level('försenad')).toBe('standard')
    expect(level('fika')).toBe('standard')
    expect(level('sambo')).toBe('standard')
    expect(level('ändå')).toBe(undefined) // 70s after försenad: under the 2-minute Hands-on gap
    expect(level('jättekul')).toBe(undefined)
    expect(r.dropped.join('\n')).toMatch(/saknas.*not found/)
    expect(r.dropped.join('\n')).toMatch(/warm-up clip for "hittepå"/)

    // Each listen-for comes before the host says the term; its spotlight after.
    for (const lemma of ['försenad', 'fika', 'sambo']) {
      const listen = r.plan.moments.find((m) => m.kind === 'listenFor' && m.term?.lemma === lemma)!
      const spot = r.plan.moments.find((m) => m.kind === 'spotlight' && m.term?.lemma === lemma)!
      expect(listen.at).toBeLessThanOrEqual(d.ep.termAt[lemma]!)
      expect(spot.at).toBeGreaterThan(d.ep.termAt[lemma]!)
    }
  })

  it('gives each guidance level the right subset', async () => {
    const d = deps()
    const { plan } = await prepareEpisode(input(d.ep), d)
    const kinds = (level: 'light' | 'standard' | 'handsOn') => new Set(selectMoments(plan.moments, level).map((m) => m.kind))
    expect([...kinds('light')].sort()).toEqual(['checkpoint', 'wrapUp'])
    expect(kinds('standard').has('cultureNote')).toBe(true)
    expect(kinds('standard').has('quickQuestion')).toBe(false)
    expect(kinds('handsOn').has('quickQuestion')).toBe(true)
  })

  it('uses the publisher transcript instead of transcribing when it is word-timed', async () => {
    const d = deps()
    const r = await prepareEpisode({ ...input(d.ep), feedWords: d.ep.words }, d)
    expect(d.transcriber.calls).toBe(0)
    expect(r.transcript.source).toBe('feed')
    expect(r.usage.transcriptionSec).toBe(0)
  })

  it('refuses to start when the daily spending cap would be exceeded', async () => {
    const d = deps(0.05)
    await expect(prepareEpisode(input(d.ep), d)).rejects.toBeInstanceOf(SpendCapReached)
    expect(d.transcriber.calls).toBe(0)
  })

  it('settles what was actually spent when a step fails part-way', async () => {
    const d = deps()
    const failing = { ...d, text: mockText(() => { throw new ProviderError('bad request', false, 400) }) }
    await expect(prepareEpisode(input(d.ep), failing)).rejects.toThrow('bad request')
    // Transcription ran and cost money; the reservation was replaced by that actual cost.
    expect(d.ledger.entries.get('job1')).toBeCloseTo((d.ep.durationSec * 0.22) / 3600, 6)
  })
})

describe('fingerprinting the copy we transcribe', () => {
  it('downloads once, fingerprints those bytes, transcribes the same bytes and links the fingerprint', async () => {
    const d = deps()
    const bytes = new Uint8Array([9, 8, 7])
    let heard: Uint8Array | undefined
    const transcriber = {
      async transcribe(i: { audioUrl: string; language: string; durationSec: number; audio?: Uint8Array }) {
        heard = i.audio
        return d.transcriber.transcribe(i)
      },
    }
    let downloads = 0
    const r = await prepareEpisode(input(d.ep), {
      ...d,
      transcriber,
      downloadAudio: async () => (downloads++, bytes),
      fingerprint: async (a) => Uint8Array.from(a, (x) => x * 2),
    })
    expect(downloads).toBe(1)
    expect(heard).toBe(bytes)
    expect(d.storage.files.get('sync/ep1.fp')).toEqual(new Uint8Array([18, 16, 14]))
    expect(r.plan.syncUrl).toBe('https://storage.test/sync/ep1.fp')
  })

  it('keeps the fingerprint when a retry resumes from the saved transcript', async () => {
    const d = deps()
    let saved: any
    await prepareEpisode(input(d.ep), { ...d, saveTranscript: async (t) => void (saved = t) })
    const r = await prepareEpisode({ ...input(d.ep), savedTranscript: saved, savedSyncUrl: 'https://storage.test/sync/ep1.fp' }, d)
    expect(r.plan.syncUrl).toBe('https://storage.test/sync/ep1.fp')
  })
})

describe('resuming a retried episode', () => {
  it('keeps the transcript as soon as it exists, and a retry skips straight to writing', async () => {
    const d = deps()
    let saved: Parameters<NonNullable<Parameters<typeof prepareEpisode>[1]['saveTranscript']>>[0] | undefined
    let voiceCalls = 0
    const failingSpeech = { ...d.speech, synthesize: async () => { voiceCalls++; throw new ProviderError('voice is down', false, 400) } }
    await expect(prepareEpisode(input(d.ep), { ...d, speech: failingSpeech, saveTranscript: async (t) => void (saved = t) })).rejects.toThrow('voice is down')
    expect(voiceCalls).toBeGreaterThan(0)
    expect(saved?.segments).toHaveLength(60)

    const stages: string[] = []
    let transcribed = 0
    const transcriber = { transcribe: async (...a: Parameters<typeof d.transcriber.transcribe>) => (transcribed++, d.transcriber.transcribe(...a)) }
    const r = await prepareEpisode({ ...input(d.ep), savedTranscript: saved }, { ...d, transcriber, onStage: (s) => void stages.push(s) })
    expect(transcribed).toBe(0)
    expect(stages).toEqual(['writing', 'voicing', 'done'])
    expect(r.usage.transcriptionSec).toBe(0)
    expect(r.transcript.segments).toHaveLength(60)
    expect(r.plan.moments.length).toBeGreaterThan(0)
  })
})

describe('assembling a plan', () => {
  it('keeps word-moment pairs together when one half fails validation', () => {
    const ep = syntheticEpisode()
    const draft = draftFor()
    draft.wordMoments = [{ ...draft.wordMoments[0]!, spotlight: 'Missing clip {clip:7}' }]
    const transcript = { language: 'sv', source: 'scribe' as const, words: ep.words, segments: [] }
    const { plan } = assemblePlan(draft, { ...transcript, segments: [] }, { episodeId: 'e', nativeLanguage: 'en', durationSec: ep.durationSec })
    expect(plan.moments.filter((m) => m.termId)).toHaveLength(0)
  })
})

describe('splitting scripts around host clips', () => {
  it('alternates guide speech and clips in order', () => {
    expect(splitScript('Listen: {clip:0}. That was {clip:1}')).toEqual([
      { kind: 'speech', text: 'Listen:' },
      { kind: 'clip', clipIndex: 0 },
      { kind: 'speech', text: '. That was' },
      { kind: 'clip', clipIndex: 1 },
    ])
  })
})
