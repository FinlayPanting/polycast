import { findBreaks, GUIDE_SPACING, pauseQuality, primerPath, selectMoments, type LessonPlan } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { memoryLedger, SpendCapReached, SpendGuard, UsageMeter } from '../src/budget'
import { assemblePlan, assemblePrimer } from '../src/pipeline/lessonPlan'
import { prepareEpisode } from '../src/pipeline/prepare'
import { splitScript, voicePlan } from '../src/pipeline/voice'
import { TARGET_SPEAKING_RATE } from '../src/providers/googleTts'
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

    // Every moment except the warm-up sits on a natural pause: never mid-sentence (PC-1017-F14).
    const breaks = new Map(findBreaks(r.transcript.words).map((b) => [b.at, b]))
    for (const m of r.plan.moments.filter((m) => m.kind !== 'warmup')) expect(pauseQuality(breaks.get(m.at)!)).toBeGreaterThan(0)

    // Every moment is voiced; host clips sit between guide speech.
    for (const m of r.plan.moments) expect(m.audio?.parts.length).toBeGreaterThan(0)
    const spot = r.plan.moments.find((m) => m.kind === 'spotlight')!
    // The lone "." between the two clips isn't sent to the voice.
    expect(spot.audio!.parts.map((p) => p.kind)).toEqual(['speech', 'clip', 'clip', 'speech'])
    expect(d.storage.files.size).toBeGreaterThan(10)

    // The real cost replaced the reservation in the ledger.
    expect(d.ledger.entries.get('job1')).toBeCloseTo(r.costUSD, 6)
  })

  it('places word moments by usefulness and spacing, and drops terms the host never says', async () => {
    const d = deps()
    const r = await prepareEpisode(input(d.ep), d)
    const level = (lemma: string) => r.plan.moments.find((m) => m.kind === 'listenFor' && m.term?.lemma === lemma)?.minLevel
    expect(level('försenad')).toBe('standard')
    expect(level('ändå')).toBe('handsOn') // 70s after försenad: past Hands-on's gap, inside Standard's
    expect(level('fika')).toBe('handsOn') // close to a recap
    expect(level('jättekul')).toBe(undefined) // 10s after fika
    expect(level('sambo')).toBe(undefined) // seconds before the wrap-up
    expect(r.dropped.join('\n')).toMatch(/saknas.*not found/)
    expect(r.dropped.join('\n')).toMatch(/warm-up clip for "hittepå"/)

    // Each listen-for comes before the host says the term; its spotlight after.
    for (const lemma of ['försenad', 'ändå', 'fika']) {
      const listen = r.plan.moments.find((m) => m.kind === 'listenFor' && m.term?.lemma === lemma)!
      const spot = r.plan.moments.find((m) => m.kind === 'spotlight' && m.term?.lemma === lemma)!
      expect(listen.at).toBeLessThanOrEqual(d.ep.termAt[lemma]!)
      expect(spot.at).toBeGreaterThan(d.ep.termAt[lemma]!)
    }
  })

  it('writes a primer: gist, words to listen for with times and the host’s clip, and themes (PC-1017-P1)', async () => {
    const d = deps()
    const { plan, dropped } = await prepareEpisode(input(d.ep), d)
    const primer = plan.primer!
    expect(primer.gist).toBe('Anna och Erik pratar om ett försenat tåg. Sen tar de en fika.') // no [[ ]] marks
    expect(primer.gistNative).toMatch(/late train/)
    // In the order they come up; the made-up word and the repeat are gone.
    expect(primer.words.map((w) => w.lemma)).toEqual(['försenad', 'ändå', 'fika', 'sambo'])
    for (const w of primer.words) {
      expect(w.at).toBeCloseTo(d.ep.termAt[w.lemma]!, 5)
      expect(w.clip.start).toBeLessThanOrEqual(w.at)
      expect(w.clip.end).toBeGreaterThan(w.at)
    }
    expect(primer.themes.map((t) => t.title)).toEqual(['A late train', 'Getting home'])
    expect(primer.themes[0]!.at).toBe(0)
    // The plan's chapters become the episode map's sections (PC-1017-P5).
    expect(primer.sections!.map((s) => s.title)).toEqual(['The train', 'Fika', 'Home'])
    expect(primer.sections!.map((s) => s.at)).toEqual([...primer.sections!.map((s) => s.at)].sort((a, b) => a - b))
    expect(dropped.join('\n')).toMatch(/primer word "hittepå"/)
  })

  it('publishes the primer as soon as it is written, before the guide is voiced (PC-1017-P3)', async () => {
    const d = deps()
    let atVoicing: Uint8Array | undefined
    const { plan } = await prepareEpisode(input(d.ep), { ...d, onStage: (s) => void (s === 'voicing' && (atVoicing = d.storage.files.get(primerPath('ep1')))) })
    expect(atVoicing).toBeDefined()
    expect(JSON.parse(new TextDecoder().decode(atVoicing))).toEqual(plan.primer)
  })

  it('leaves the primer out when too few of its words are in the episode', () => {
    const ep = syntheticEpisode()
    const primer = assemblePrimer({ gist: 'Hej.', gistNative: 'Hi.', words: [{ text: 'fika', lemma: 'fika', meaning: 'x', segmentId: 's33' }], themes: [] }, { language: 'sv', source: 'scribe', words: ep.words, segments: [] })
    expect(primer).toBeUndefined()
  })

  it('gives each guidance level the right subset', async () => {
    const d = deps()
    const { plan } = await prepareEpisode(input(d.ep), d)
    const kinds = (level: 'light' | 'standard' | 'handsOn') => new Set(selectMoments(plan.moments, level).map((m) => m.kind))
    expect([...kinds('light')].sort()).toEqual(['checkpoint', 'wrapUp'])
    expect(kinds('standard').has('listenFor')).toBe(true)
    expect(kinds('standard').has('quickQuestion')).toBe(false)
    expect(kinds('handsOn').has('quickQuestion')).toBe(true)
    expect(kinds('handsOn').has('cultureNote')).toBe(true)

    // Spread out: at each level, guide stops (a word moment's pair counts as one) keep that level's gap.
    for (const level of ['light', 'standard', 'handsOn'] as const) {
      const stops = selectMoments(plan.moments, level).filter((m) => m.kind !== 'warmup' && m.kind !== 'spotlight').map((m) => m.at)
      for (let i = 1; i < stops.length; i++) expect(stops[i]! - stops[i - 1]!).toBeGreaterThanOrEqual(Math.min(GUIDE_SPACING[level], 40) - 15)
    }
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
    expect(r.plan.loudnessLufs).toBeUndefined()
  })

  it("measures the loudness of the same copy and keeps it with the lesson (PC-1017-F16)", async () => {
    const d = deps()
    const bytes = new Uint8Array([9, 8, 7])
    let measured: Uint8Array | undefined
    const r = await prepareEpisode(input(d.ep), { ...d, downloadAudio: async () => bytes, fingerprint: async (a) => a, loudness: async (a) => ((measured = a), -24.5) })
    expect(measured).toBe(bytes)
    expect(r.plan.loudnessLufs).toBe(-24.5)
  })

  it('still prepares the episode when the loudness cannot be measured', async () => {
    const d = deps()
    const r = await prepareEpisode(input(d.ep), { ...d, downloadAudio: async () => new Uint8Array([1]), fingerprint: async (a) => a, loudness: async () => { throw new Error('ffmpeg missing') } })
    expect(r.plan.loudnessLufs).toBeUndefined()
    expect(r.plan.moments.length).toBeGreaterThan(0)
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

describe('voicing target-language words', () => {
  const plan = {
    episodeId: 'e',
    version: 2,
    targetLanguage: 'sv',
    nativeLanguage: 'en',
    hosts: [],
    summary: '',
    wrapUpQuestions: [],
    moments: [{ id: 'spot-1', kind: 'spotlight', at: 10, minLevel: 'standard', script: 'They are late. {clip:0} Or: [[jag är sen]], I am late.', clips: [{ start: 1, end: 2 }] }],
  } as unknown as LessonPlan

  it('reads [[…]] in the target language with the same voice, and the rest in the learner\'s own', async () => {
    const said: string[] = []
    const speech = { ...mockSpeech(), synthesize: (r: { text: string; voice: string; style: string; language: string }) => (said.push(`${r.language}:${r.text}`), mockSpeech().synthesize(r)) }
    const out = await voicePlan(plan, DEFAULT_GUIDE, { speech, storage: memoryStorage(), meter: new UsageMeter() })
    expect(said).toEqual(['en:They are late.', 'en:Or:', 'sv:jag är sen', 'en:, I am late.'])
    expect(out.moments[0]!.audio!.parts.map((p) => p.kind)).toEqual(['speech', 'clip', 'speech', 'speech', 'speech'])
  })

  it('reads target-language words slowly, and the guide\'s own words at its normal pace', async () => {
    const rates: string[] = []
    const speech = { ...mockSpeech(), synthesize: (r: { text: string; voice: string; style: string; language: string; rate?: number }) => (rates.push(`${r.language}:${r.rate ?? 'default'}`), mockSpeech().synthesize(r)) }
    await voicePlan(plan, DEFAULT_GUIDE, { speech, storage: memoryStorage(), meter: new UsageMeter() })
    expect(rates).toEqual(['en:default', 'en:default', `sv:${TARGET_SPEAKING_RATE}`, 'en:default'])
  })

  it('falls back to the learner\'s own language if the target voice fails', async () => {
    const said: string[] = []
    const speech = {
      synthesize: async (r: { text: string; voice: string; style: string; language: string }) => {
        if (r.language === 'sv') throw new ProviderError('no such voice', false, 400)
        said.push(`${r.language}:${r.text}`)
        return mockSpeech().synthesize(r)
      },
    }
    await voicePlan(plan, DEFAULT_GUIDE, { speech, storage: memoryStorage(), meter: new UsageMeter() })
    expect(said).toContain('en:jag är sen')
  })

  it('sends each mixed line as one call to a voice that handles both languages, keeping a lone repeat slow', async () => {
    const said: string[] = []
    const speech = {
      mixedLanguage: true,
      synthesize: (r: { text: string; voice: string; style: string; language: string; rate?: number; mixed?: boolean }) => (said.push(`${r.mixed ? 'mixed' : r.language}@${r.rate ?? 'default'}:${r.text}`), mockSpeech().synthesize(r)),
    }
    const withRepeat = { ...plan, moments: [{ ...plan.moments[0]!, script: 'Here’s Anna: {clip:0}. [[försenad]]. It means delayed. Or: [[jag är sen]], I am late.' }] } as unknown as LessonPlan
    const out = await voicePlan(withRepeat, DEFAULT_GUIDE, { speech, storage: memoryStorage(), meter: new UsageMeter() })
    expect(said).toEqual(['mixed@default:Here’s Anna:', `sv@${TARGET_SPEAKING_RATE}:försenad`, 'mixed@default:It means delayed. Or: jag är sen, I am late.'])
    expect(out.moments[0]!.audio!.parts.map((p) => p.kind)).toEqual(['speech', 'clip', 'speech', 'speech'])
  })
})

describe('the lesson recap line (PC-1019-F01)', () => {
  it('keeps one short culture line in the plan for the share card, without guide marks', async () => {
    const { assemblePlan, recapLine } = await import('../src/pipeline/lessonPlan')
    const ep = syntheticEpisode()
    const transcript = { language: 'sv', source: 'scribe' as const, words: ep.words, segments: [] }
    const withLine = assemblePlan({ ...draftFor(), recap: { didYouKnow: '  Swedes stop for [[fika]], a proper coffee break.  ' } }, transcript, { episodeId: 'e', nativeLanguage: 'en', durationSec: ep.durationSec })
    expect(withLine.plan.recap).toEqual({ didYouKnow: 'Swedes stop for fika, a proper coffee break.' })
    const without = assemblePlan(draftFor(), transcript, { episodeId: 'e', nativeLanguage: 'en', durationSec: ep.durationSec })
    expect(without.plan.recap).toBeUndefined()
    const long = recapLine({ ...draftFor(), recap: { didYouKnow: Array.from({ length: 40 }, () => 'word').join(' ') } })!
    expect(long.split(' ')).toHaveLength(30)
  })
})
