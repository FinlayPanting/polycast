import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { GuideMoment, LessonPlan, Transcript } from '@polycast/core'
import { claudeText } from '../src/lab/anthropic'
import { HAIKU_LONG_PROMPT_TOKENS, textCostUSD, voiceCostUSD } from '../src/lab/prices'
import { fadeWav, HANDOVER, joinWavs, LAB_RATE, lineChain, runFfmpeg, scaleWav, silence, tidyLine, wavData } from '../src/lab/sound'
import { cleanTake, takeHash, voiceAndStore, voiceLine } from '../src/lab/voice'
import { episodeAudio, renderMoment, type EpisodeForLab } from '../src/lab/moment'
import { compareScripts, firstMinutes, scriptPrompt } from '../src/lab/writing'
import { createLab, LAB_WRONG_TRIES, parseMaiVoices } from '../src/lab/routes'
import { labSpend, listRuns, pickRun, saveRun } from '../src/lab/runs'
import { wavDurationSec } from '../src/audio'
import type { Storage } from '../src/providers/types'
import type { Sql } from '../src/db'
import { freshDatabase, PG_TEST_URL } from './pg'

/** A tone of `seconds` as MP3, made with ffmpeg (a stand-in for what a voice or a feed returns). */
async function toneMp3(seconds: number, freq = 440): Promise<Uint8Array> {
  return (await runFfmpeg(['-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`, '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', 'pipe:1'])).out
}

function memoryStorage(): Storage & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>()
  return {
    files,
    async put(path, bytes) {
      files.set(path, bytes)
      return `https://store.test/${path}`
    },
    async exists(path) {
      return files.has(path) ? `https://store.test/${path}` : undefined
    },
  }
}

/** Fetch for tests: ElevenLabs answers with a tone, stored files come back from memory. */
function fakeFetch(storage: ReturnType<typeof memoryStorage>, tone: Uint8Array, calls: { url: string; body?: any }[] = []) {
  return (async (url: string, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, body: init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    if (u.startsWith('https://store.test/')) {
      const f = storage.files.get(u.slice('https://store.test/'.length))
      return f ? new Response(Buffer.from(f)) : new Response('missing', { status: 404 })
    }
    if (u.includes('/v1/text-to-speech/')) return new Response(Buffer.from(tone))
    if (u.includes('/v1/voices')) return Response.json({ voices: [{ voice_id: 'v-extra', name: 'Extra', labels: { accent: 'british' } }] })
    if (u.includes('/v1/models')) return Response.json([{ model_id: 'eleven_v4_turbo', name: 'Eleven v4 Turbo', can_do_text_to_speech: true }])
    if (u.includes('audio-effects/catalog')) return Response.json({ environments: [{ id: 'env_small', name: 'Small room' }] })
    return new Response('not found', { status: 404 })
  }) as unknown as typeof fetch
}

describe('Lab prices (PC-1021-L1)', () => {
  it('prices Haiku 5.5 by prompt size and voices by their own units', () => {
    expect(textCostUSD('claude-haiku-5-5', 100_000, 1_000_000)).toBeCloseTo(0.51, 6)
    expect(textCostUSD('claude-haiku-5-5', HAIKU_LONG_PROMPT_TOKENS + 1, 0)).toBeCloseTo((HAIKU_LONG_PROMPT_TOKENS + 1) * 0.5e-6, 9)
    expect(textCostUSD('gemini-3.8-flash', 1_000_000, 0, new Date('2026-10-21'))).toBeCloseTo(0.75, 6)
    expect(textCostUSD('gemini-3.8-flash', 1_000_000, 0, new Date('2027-01-02'))).toBeCloseTo(1.5, 6)
    expect(textCostUSD('nope', 100, 100)).toBe(0)
    expect(voiceCostUSD('elevenlabs', 'eleven_v4_turbo', 1000, 0)).toBeCloseTo(0.04, 6)
    expect(voiceCostUSD('chirp', '', 1000, 0)).toBeCloseTo(0.03, 6)
    expect(voiceCostUSD('gemini', 'gemini-3.8-flash-tts', 0, 10, new Date('2026-10-21'))).toBeCloseTo(10 * 25 * 9e-6, 9)
  })
})

describe('Lab takes', () => {
  it('cleans a take from the page and names it stably', () => {
    const t = cleanTake({ provider: 'elevenlabs', voice: 'abc', speed: 3, effects: { environment_id: 'env_small', send_level: 7, junk: 1 }, sound: 'studio', evil: true })
    expect(t).toEqual({ provider: 'elevenlabs', voice: 'abc', speed: 1.2, effects: { environment_id: 'env_small', send_level: 1 }, sound: 'studio' })
    expect(cleanTake({ provider: 'chirp', voice: '../../x', effects: { environment_id: 'e' }, sound: 'hall' })).toMatchObject({ provider: 'chirp', voice: 'Sulafat', effects: null, sound: 'dry' })
    const line = { text: 'Hej [[fika]]', nativeLanguage: 'en', targetLanguage: 'sv' }
    expect(takeHash(t, line)).toBe(takeHash({ ...t }, { ...line }))
    expect(takeHash(t, line)).not.toBe(takeHash({ ...t, speed: 1 }, line))
  })

  it('keeps the app’s tidy-up in every sound setting, and only gentle ones', () => {
    for (const s of ['dry', 'studio', 'smallRoom', 'backOfRoom'] as const) {
      const c = lineChain(s)
      expect(c).toContain('loudnorm=I=-16')
      expect(c.match(/afade/g)).toHaveLength(2)
    }
    expect(lineChain('dry').startsWith('loudnorm')).toBe(true)
  })
})

describe('Lab audio', () => {
  it('joins, fades and scales Lab WAVs', () => {
    const a = silence(0.5)
    const joined = joinWavs([a, silence(0.25)])
    expect(wavDurationSec(joined)).toBeCloseTo(0.75, 3)
    // A constant signal, faded: first and last frames silent, the middle untouched.
    const loud = new Uint8Array(silence(1))
    const s = new Int16Array(wavData(loud).buffer, wavData(loud).byteOffset, LAB_RATE * 2)
    s.fill(10000)
    const faded = fadeWav(loud, 0.1, 0.1)
    const f = new Int16Array(wavData(faded).buffer, wavData(faded).byteOffset, LAB_RATE * 2)
    expect(f[0]).toBe(0)
    expect(f[LAB_RATE]).toBe(10000)
    expect(Math.abs(f[2 * LAB_RATE - 1]!)).toBeLessThan(10)
    const half = scaleWav(loud, 0.5)
    expect(new Int16Array(wavData(half).buffer, wavData(half).byteOffset, 4)[0]).toBe(5000)
  })

  it('tidies any voice’s audio to the Lab format with its length', async () => {
    const { wav, durationSec } = await tidyLine(await toneMp3(1), 'smallRoom')
    expect(durationSec).toBeGreaterThan(0.9)
    expect(durationSec).toBeLessThan(1.4)
    expect(new DataView(wav.buffer, wav.byteOffset).getUint32(24, true)).toBe(LAB_RATE)
  })
})

describe('Voicing a line in the Lab', () => {
  it('reads a mixed line in one ElevenLabs call, a lone term slowly, and never pays twice', async () => {
    const storage = memoryStorage()
    const calls: { url: string; body?: any }[] = []
    const f = fakeFetch(storage, await toneMp3(0.6), calls)
    const take = cleanTake({ provider: 'elevenlabs', voice: 'voice-1', effects: { environment_id: 'env_small', send_level: 0.25 } })
    const line = { text: 'That was Anna. [[försenad]]. It means delayed, as in [[tåget är försenat]].', nativeLanguage: 'en', targetLanguage: 'sv' }
    const v = await voiceLine(take, line, { elevenlabs: 'k' }, { fetchImpl: f })
    const tts = calls.filter((c) => c.url.includes('text-to-speech'))
    expect(tts.map((c) => c.body.text)).toEqual(['That was Anna.', 'försenad', 'It means delayed, as in tåget är försenat.'])
    expect(tts[0]!.body.language_code).toBeUndefined() // mixed lines aren't pinned to one language
    expect(tts[1]!.body).toMatchObject({ language_code: 'sv', voice_settings: { speed: 0.8 } })
    expect(tts[0]!.body.audio_effects).toEqual({ environment_id: 'env_small', send_level: 0.25 })
    expect(tts[0]!.url).toContain('mp3_44100_128')
    // Three tidied runs with the app's 120 ms gaps between them.
    expect(v.durationSec).toBeGreaterThan(3 * 0.5 + 0.24)
    expect(v.chars).toBe(['That was Anna.', 'försenad', 'It means delayed, as in tåget är försenat.'].join('').length)
    expect(v.costUSD).toBeCloseTo(v.chars * 40e-6, 9)

    const first = await voiceAndStore(take, line, { keys: { elevenlabs: 'k' }, storage, fetchImpl: f })
    expect(first.cached).toBe(false)
    expect(storage.files.has(`lab/voice/${first.hash}.mp3`)).toBe(true)
    const before = calls.length
    const again = await voiceAndStore(take, line, { keys: { elevenlabs: 'k' }, storage, fetchImpl: f })
    expect(again).toMatchObject({ cached: true, costUSD: 0, url: first.url })
    expect(again.durationSec).toBeCloseTo(first.durationSec, 3)
    expect(calls.slice(before).some((c) => c.url.includes('text-to-speech'))).toBe(false)
  })

  it('voices a whole mixed line in one MAI-Voice call through OpenRouter and prices it per character (PC-1024-05)', async () => {
    const tone = await toneMp3(0.6)
    const calls: { url: string; body?: any; auth?: string }[] = []
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: (init?.headers as any)?.Authorization })
      return new Response(tone, { headers: { 'Content-Type': 'audio/mpeg' } })
    }) as unknown as typeof fetch
    const take = cleanTake({ provider: 'mai', voice: 'en-GB-Ada:MAI-Voice-2.1', speed: 1.1 })
    expect(take).toMatchObject({ provider: 'mai', voice: 'en-GB-Ada:MAI-Voice-2.1' })
    const line = { text: 'In Sweden, [[fika]] is a coffee break with something sweet.', nativeLanguage: 'en', targetLanguage: 'sv' }
    const v = await voiceLine(take, line, { openrouter: 'ork' }, { fetchImpl: f })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ url: 'https://openrouter.ai/api/v1/audio/speech', auth: 'Bearer ork' })
    expect(calls[0]!.body).toEqual({ model: 'microsoft/mai-voice-2.1', input: 'In Sweden, fika is a coffee break with something sweet.', voice: 'en-GB-Ada:MAI-Voice-2.1', response_format: 'mp3' })
    expect(v.durationSec).toBeGreaterThan(0.5)
    expect(v.costUSD).toBeCloseTo(v.chars * 22e-6, 12)
    expect(voiceCostUSD('mai', 'microsoft/mai-voice-2.1', 1_000_000, 0)).toBeCloseTo(22, 9)
    await expect(voiceLine(take, line, {})).rejects.toThrow(/OPENROUTER_API_KEY/)
    // A colon is only allowed in MAI-Voice ids, and nothing else odd gets through.
    expect(cleanTake({ provider: 'mai', voice: 'x:y:z' }).voice).not.toBe('x:y:z')
    expect(cleanTake({ provider: 'chirp', voice: 'a:b' }).voice).not.toBe('a:b')
  })

  it('reads MAI-Voice-2.1’s voices from OpenRouter’s model list, launch languages first', () => {
    const body = { data: [
      { id: 'openai/gpt-4o-mini-tts', supported_voices: ['alloy'] },
      { id: 'microsoft/mai-voice-2.1', supported_voices: ['ja-JP-Aoi:MAI-Voice-2.1', 'en-US-Harper:MAI-Voice-2.1', 'sv-SE-Sofie:MAI-Voice-2.1', 'es-ES-Ximena:MAI-Voice-2.1', 'bad id!', { id: 'fr-FR-Lea:MAI-Voice-2.1' }] },
    ] }
    expect(parseMaiVoices(body).map((v) => v.id)).toEqual(['es-ES-Ximena:MAI-Voice-2.1', 'fr-FR-Lea:MAI-Voice-2.1', 'sv-SE-Sofie:MAI-Voice-2.1', 'en-US-Harper:MAI-Voice-2.1'])
    expect(parseMaiVoices(body)[0]!.name).toBe('es-ES-Ximena')
    expect(parseMaiVoices('nope')).toEqual([])
    expect(parseMaiVoices({ data: [] })).toEqual([])
  })

  it('says which key is missing', async () => {
    await expect(voiceLine(cleanTake({ provider: 'chirp', voice: 'Sulafat' }), { text: 'Hello', nativeLanguage: 'en', targetLanguage: 'sv' }, {})).rejects.toThrow(/GOOGLE_TTS_API_KEY/)
  })
})

describe('Claude for lesson writing (PC-1021-06)', () => {
  it('forces the answer through one tool with the plan’s schema and reports tokens', async () => {
    let sent: any
    const f = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return Response.json({ content: [{ type: 'tool_use', name: 'answer', input: { script: 'Hej' } }], usage: { input_tokens: 120, output_tokens: 8 } })
    }) as unknown as typeof fetch
    const r = await claudeText('key', 'claude-haiku-5-5', f).generateJson<{ script: string }>({ system: 'S', prompt: 'P', schema: { type: 'object' } })
    expect(r).toEqual({ data: { script: 'Hej' }, usage: { textInTokens: 120, textOutTokens: 8 } })
    expect(sent).toMatchObject({ model: 'claude-haiku-5-5', system: 'S', tool_choice: { type: 'tool', name: 'answer' }, tools: [{ name: 'answer', input_schema: { type: 'object' } }] })
  })
})

/** A two-minute fake episode: a tone, with one spotlight moment at 60 s that plays the host at 40–41.5 s. */
function fakeEpisode(): EpisodeForLab {
  const words = Array.from({ length: 120 }, (_, i) => ({ text: `ord${i}`, start: i, end: i + 0.8 }))
  const segments = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, start: i * 10, end: i * 10 + 9.8, speaker: 'A', text: words.slice(i * 10, i * 10 + 10).map((w) => w.text).join(' '), wordStart: i * 10, wordEnd: i * 10 + 10 }))
  const moment: GuideMoment = {
    id: 'spotlight-1',
    kind: 'spotlight',
    at: 60,
    minLevel: 'standard',
    script: 'That was Anna: {clip:0} [[försenad]] means late.',
    clips: [{ start: 40, end: 41.5 }],
    audio: { parts: [{ kind: 'speech', url: 'https://store.test/guide/a.m4a', durationSec: 1 }, { kind: 'clip', clipIndex: 0 }, { kind: 'speech', url: 'https://store.test/guide/b.m4a', durationSec: 1 }], durationSec: 3.5 },
  }
  const plan = { episodeId: 'ep', version: 4, targetLanguage: 'sv', nativeLanguage: 'en', hosts: [], summary: '', moments: [moment], wrapUpQuestions: [] } as unknown as LessonPlan
  const transcript: Transcript = { language: 'sv', source: 'scribe', words, segments }
  return { id: '00000000-0000-0000-0000-000000000001', title: 'Avsnitt', podcastTitle: 'Podd', audioUrl: 'https://feed.test/ep.mp3', language: 'sv', nativeLanguage: 'en', transcript, plan, guideId: 'mia' }
}

describe('Guide moment preview', () => {
  it('plays the moment as the phone does: fade out, breath, guide, host clip, guide, pick up two seconds back', async () => {
    const storage = memoryStorage()
    storage.files.set('guide/a.m4a', await toneMp3(1, 660))
    storage.files.set('guide/b.m4a', await toneMp3(1, 660))
    const f = fakeFetch(storage, await toneMp3(0.5))
    const ep = fakeEpisode()
    const episode = await episodeAudio(ep, { download: async () => toneMp3(120, 220) })
    expect(episode.synced).toBe('unchecked')
    const r = await renderMoment(ep, episode, 'spotlight-1', { label: 'Stored' }, { keys: {}, storage, fetchImpl: f }, { leadSec: 5, tailSec: 4 })
    expect(r.pieces.map((p) => p.kind)).toEqual(['episode', 'pause', 'guide', 'pause', 'clip', 'pause', 'guide', 'pause', 'episode'])
    const [lead, , , gap1, clip, gap2, , , tail] = r.pieces
    expect(lead!.from).toBe(55)
    expect(lead!.durationSec).toBeCloseTo(5, 1)
    expect(gap1!.durationSec).toBeCloseTo(HANDOVER.gapBeforeClipSec, 3)
    expect(gap2!.durationSec).toBeCloseTo(HANDOVER.gapAfterClipSec, 3)
    expect(clip!.from).toBeCloseTo(40 - HANDOVER.clipLeadSec, 3)
    expect(clip!.durationSec).toBeCloseTo(1.5 + HANDOVER.clipLeadSec + HANDOVER.clipTailSec, 1)
    expect(tail!.from).toBe(58)
    expect(tail!.durationSec).toBeCloseTo(6, 1)
    expect(r.costUSD).toBe(0)
    expect(r.mp3.byteLength).toBeGreaterThan(1000)
    expect(r.warnings.join(' ')).toMatch(/weren’t|wasn’t checked/)
  })

  it('re-voices with a rewritten script and charges only the voice', async () => {
    const storage = memoryStorage()
    const calls: { url: string; body?: any }[] = []
    const f = fakeFetch(storage, await toneMp3(0.5), calls)
    const ep = fakeEpisode()
    const episode = await episodeAudio(ep, { download: async () => toneMp3(120, 220) })
    const take = cleanTake({ provider: 'elevenlabs', voice: 'v1' })
    const r = await renderMoment(ep, episode, 'spotlight-1', { label: 'New', take, script: 'Anna again: {clip:0} Late!' }, { keys: { elevenlabs: 'k' }, storage, fetchImpl: f }, { leadSec: 0, tailSec: 0 })
    expect(r.pieces.map((p) => p.kind)).toEqual(['pause', 'guide', 'pause', 'clip', 'pause', 'guide', 'pause'])
    expect(calls.filter((c) => c.url.includes('text-to-speech')).map((c) => c.body.text)).toEqual(['Anna again:', 'Late!'])
    expect(r.costUSD).toBeCloseTo('Anna again:Late!'.length * 40e-6, 9)
    await expect(renderMoment(ep, episode, 'spotlight-1', { label: 'x', script: 'No voice' }, { keys: {}, storage, fetchImpl: f })).rejects.toThrow(/needs a voice/)
  })
})

describe('Writing tests', () => {
  it('cuts a transcript to its first minutes', () => {
    const ep = fakeEpisode()
    const { transcript, durationSec } = firstMinutes(ep.transcript, 1)
    expect(transcript.segments.map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5'])
    expect(durationSec).toBeLessThanOrEqual(60)
    expect(transcript.words.length).toBe(transcript.segments.at(-1)!.wordEnd)
    expect(firstMinutes(ep.transcript, 0).transcript).toBe(ep.transcript)
  })

  it('asks for a rewrite with the writer’s rules and flags lost host clips', async () => {
    const ep = fakeEpisode()
    const { system, prompt } = scriptPrompt(ep, 'spotlight-1', 'Shorter, please.')
    expect(system).toContain('lesson-plan writer')
    expect(prompt).toContain('{clip:0} = the host saying “ord40 ord41”')
    expect(prompt).toContain('What to change: Shorter, please.')
    const f = (async () => Response.json({ output_text: JSON.stringify({ script: 'Anna said it. [[försenad]].' }), usage: { input_tokens: 1000, output_tokens: 20 } })) as unknown as typeof fetch
    const r = await compareScripts(ep, 'spotlight-1', ['gemini-3.8-flash'], undefined, { gemini: 'k' }, f)
    expect(r.current).toBe(ep.plan.moments[0]!.script)
    expect(r.results[0]).toMatchObject({ ok: true, script: 'Anna said it. [[försenad]].', clipProblems: ['lost {clip:0}'] })
    expect(r.results[0]!.costUSD).toBeGreaterThan(0)
    const noKey = await compareScripts(ep, 'spotlight-1', ['claude-haiku-5-5'], undefined, {}, f)
    expect(noKey.results[0]).toMatchObject({ ok: false, error: expect.stringMatching(/ANTHROPIC_API_KEY/) })
  })
})

describe('Lab routes', () => {
  const sql = (() => {
    throw new Error('no database in this test')
  }) as unknown as Sql
  const lab = (storage = memoryStorage(), f?: typeof fetch) => createLab({ sql, token: 'secret', keys: { elevenlabs: 'k' }, storage, download: async () => new Uint8Array(), fetch: f, wrongPasswordDelayMs: 0 })

  it('serves the page to anyone, the API only with the password', async () => {
    const app = lab()
    const pageRes = await app.request('/')
    expect(pageRes.status).toBe(200)
    expect(await pageRes.text()).toContain('Polycast Lab')
    expect((await app.request('/api/runs')).status).toBe(401)
    expect((await app.request('/api/runs', { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401)
    expect((await app.request('/api/render/x?token=secret')).status).toBe(404)
  })

  it('takes the password in the address only for audio previews, and turns away repeated wrong guesses (PC-1022-02)', async () => {
    const app = lab()
    expect((await app.request('/api/runs?token=secret')).status).toBe(401)
    const from = (ip: string, token: string) => app.request('/api/render/x', { headers: { Authorization: `Bearer ${token}`, 'X-Real-IP': ip } })
    for (let i = 0; i < LAB_WRONG_TRIES.perAddress; i++) expect((await from('203.0.113.9', `guess${i}`)).status).toBe(401)
    expect((await from('203.0.113.9', 'guess-last')).status).toBe(401)
    // Locked out now, even with the right password; other addresses are unaffected.
    expect((await from('203.0.113.9', 'secret')).status).toBe(429)
    expect((await from('198.51.100.7', 'secret')).status).toBe(404)
  })

  it('estimates a voice run before spending anything', async () => {
    const calls: { url: string }[] = []
    const storage = memoryStorage()
    const app = lab(storage, fakeFetch(storage, new Uint8Array(), calls))
    const res = await app.request('/api/voice', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimate: true, lines: ['Swedes call it [[fika]].'], takes: [{ provider: 'elevenlabs', voice: 'v1' }, { provider: 'chirp', voice: 'Sulafat' }] }),
    })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.estimate[0].usd).toBeCloseTo('Swedes call it fika.'.length * 40e-6, 9)
    expect(json.estimate[1].usd).toBeCloseTo('Swedes call it fika.'.length * 30e-6, 9)
    expect(calls).toHaveLength(0)
    const bad = await app.request('/api/voice', { method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: ['x'.repeat(601)], takes: [{}] }) })
    expect(bad.status).toBe(400)
  })
})

const run = PG_TEST_URL ? describe : describe.skip
run('Saved Lab runs (database)', () => {
  let db: { sql: Sql; drop: () => Promise<void> }
  beforeAll(async () => {
    db = await freshDatabase()
  })
  afterAll(async () => {
    await db?.drop()
  })

  it('saves runs with their cost and pick, and adds up the spend', async () => {
    const id = await saveRun(db.sql, { kind: 'voice', title: 'Fika', config: { lines: ['x'] }, results: [[{ label: 'A' }]], costUSD: 0.0123, by: 'claude' })
    expect(id).toBeTruthy()
    await saveRun(db.sql, { kind: 'plan', title: 'Plans', config: {}, results: [], costUSD: 0.5, by: 'finlay' })
    expect(await pickRun(db.sql, id!, { label: 'A' }, 'Warmer')).toBe(true)
    const { runs, saving } = await listRuns(db.sql, { kind: 'voice' })
    expect(saving).toBe(true)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ title: 'Fika', cost_usd: 0.0123, pick: { label: 'A' }, note: 'Warmer', created_by: 'claude' })
    expect((await labSpend(db.sql))!.todayUSD).toBeCloseTo(0.5123, 4)
  })

  it('keeps working, unsaved, before the migration is applied', async () => {
    await db.sql`drop table lab_runs`
    expect(await saveRun(db.sql, { kind: 'voice', title: '', config: {}, results: [], costUSD: 0, by: 'finlay' })).toBeUndefined()
    expect(await listRuns(db.sql)).toEqual({ runs: [], saving: false })
    expect(await labSpend(db.sql)).toBeUndefined()
  })
})
