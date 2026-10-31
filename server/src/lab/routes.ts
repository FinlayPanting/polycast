import { randomUUID, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Hono, type Context } from 'hono'
import { LAUNCH_LANGUAGES } from '@polycast/core'
import type { Sql } from '../db'
import type { Storage } from '../providers/types'
import { fetchEffectsCatalog, roomSettings } from '../roomAudition'
import { GUIDES, guideById } from '../voices'
import { labEpisodes, loadEpisode, episodeAudio, momentSummary, renderMoment, type MomentVariant } from './moment'
import { fetchArtwork, momentCaptions, renderMomentVideo, VIDEO_MAX_SEC } from './video'
import type { LookupHost } from '../safeFetch'
import { estimateVoiceUSD, GEMINI_TTS, TEXT_MODELS, voicePerHourUSD } from './prices'
import { getRun, labSpend, listRuns, pickRun, saveRun, type RunKind } from './runs'
import { clientAddress, rateLimiter } from '../rateLimit'
import { SOUND_PRESETS } from './sound'
import { cleanTake, voiceAndStore, type LabKeys, type Take } from './voice'
import { comparePlans, compareScripts, estimatePlanUSD, estimateScriptUSD } from './writing'
import { splitScript } from '../pipeline/voice'

/**
 * The Lab (PC-1021-L1): a password-protected page on the server for testing what Mia and Leo sound
 * like and say, without a build or the phone. Voices, sound settings, guide moments heard in place,
 * script rewrites and whole lesson plans, each with its cost, every run saved with the take picked.
 * Off unless LAB_TOKEN is set. The same API lets Claude run tests itself (header X-Lab-By: claude).
 */

export interface LabDeps {
  sql: Sql
  token: string
  keys: LabKeys
  storage: Storage
  download: (url: string) => Promise<Uint8Array>
  fingerprint?: (audio: Uint8Array) => Promise<Uint8Array>
  fetch?: typeof fetch
  /** Resolves host names for safeFetch; tests swap in a fake (PC-1030-01). */
  lookupHost?: LookupHost
  /** The ElevenLabs model the guide uses now (resolved at start-up). */
  elevenModel?: string
  /** How long a wrong password waits before its answer (PC-1022-02); tests set 0. */
  wrongPasswordDelayMs?: number
  /** Makes a moment video (PC-1029-10); tests swap in a fake so they don't need ffmpeg. */
  renderVideo?: typeof renderMomentVideo
}

/**
 * Wrong Lab passwords (PC-1022-02): each waits a moment before its answer, and an address that
 * gets it wrong this many times in 15 minutes is turned away until the window ends, right
 * password or not. Lab runs have no spending cap, so the password is worth guarding.
 */
export const LAB_WRONG_TRIES = { perAddress: 10, windowMs: 15 * 60_000, delayMs: 750 }

/** Gemini's and Chirp 3 HD's shared voice names. */
export const GOOGLE_VOICES = [
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe', 'Callirrhoe', 'Charon', 'Despina',
  'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus', 'Puck',
  'Pulcherrima', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi',
]

/** Ready-made test lines per language: a guide line with a word in it, the word alone, a question. */
export const SAMPLE_LINES: Record<string, string[]> = {
  sv: [
    'They’re talking about summer houses now. Here’s Alex: [[sommarstuga]]. It means a summer cottage.',
    'Swedes call a coffee break [[fika]], and they take it very seriously.',
    '[[Jag är lite försenad]]. I’m running a bit late.',
    'Quick question. What did Sigge say he forgot to bring?',
  ],
  de: [
    'They’ve moved on to work now. Here’s Lena: [[Feierabend]]. It’s the moment work is over for the day.',
    'Germans say [[Das ist mir Wurst]] when they really don’t mind either way.',
    '[[Ich komme gleich]]. I’ll be right there.',
    'Quick question. Why was Jonas late to the recording?',
  ],
  es: [
    'Now they’re planning the weekend. Here’s Lucía: [[madrugar]]. It means getting up really early.',
    'In Spain, [[la sobremesa]] is the long chat at the table after a meal.',
    '[[Me da igual]]. I don’t mind.',
    'Quick question. Where are they going on Saturday?',
  ],
  fr: [
    'They’re talking about the commute now. Here’s Camille: [[en retard]]. It means late.',
    'The French say [[avoir la flemme]] when they just can’t be bothered.',
    '[[Ça me dit quelque chose]]. That rings a bell.',
    'Quick question. What did Hugo forget at home?',
  ],
  it: [
    'They’re on to food now. Here’s Giulia: [[la merenda]]. It’s an afternoon snack.',
    'In Italy, [[fare la scarpetta]] is wiping your plate clean with bread.',
    '[[Non vedo l’ora]]. I can’t wait.',
    'Quick question. What did Marco cook last night?',
  ],
  pt: [
    'They’re talking about the beach now. Here’s Ana: [[saudade]]. It’s a longing for something you miss.',
    'In Brazil, [[dar um jeitinho]] means finding a clever way round a problem.',
    '[[Tudo bem?]] All good?',
    'Quick question. Who did Rafa meet at the market?',
  ],
  en: [
    'Sie sprechen jetzt über das Wetter. Hier ist Sam: [[gloomy]]. Das heißt trüb.',
    'Briten sagen [[a cuppa]], wenn sie eine Tasse Tee meinen.',
    '[[I’m running a bit late]]. Ich bin etwas spät dran.',
    'Kurze Frage: Was hat Sam vergessen?',
  ],
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const LIMITS = { lines: 10, takes: 8, lineChars: 600, variants: 6, models: 4, instructionChars: 1000 }

interface Render {
  mp3: Uint8Array
  expires: number
}
const RENDER_TTL_MS = 30 * 60_000
const MAX_RENDERS = 40
/** Moment videos (PC-1029-10) are a few megabytes each, so fewer are kept. */
const MAX_VIDEOS = 6

let pageCache: string | undefined
function page(): string {
  if (!pageCache) pageCache = readFileSync(new URL('./page.html', import.meta.url), 'utf8')
  return pageCache
}

export function createLab(deps: LabDeps) {
  const app = new Hono()
  const f = deps.fetch ?? fetch
  const renders = new Map<string, Render>()
  const videos = new Map<string, { mp4: Uint8Array; name: string; expires: number }>()
  let voiceList: { at: number; voices: { id: string; name: string; labels?: Record<string, string>; category?: string }[]; models: { id: string; name: string }[] } | undefined

  const wrongTries = rateLimiter(LAB_WRONG_TRIES.perAddress, LAB_WRONG_TRIES.windowMs)
  const lockedOut = new Map<string, number>()
  /**
   * The password goes in the Authorization header. Only audio previews (played by an <audio> tag,
   * which can't send headers) take it in the address, so it doesn't end up in server logs otherwise.
   */
  const authorised = (c: Context) => {
    const header = c.req.header('Authorization')?.replace(/^Bearer /, '')
    const given = header ?? (c.req.method === 'GET' && /\/api\/(render|video)\/[^/]+$/.test(c.req.path) ? c.req.query('token') : undefined)
    return Boolean(given && safeEqual(given, deps.token))
  }
  const by = (c: Context): 'finlay' | 'claude' => (c.req.header('X-Lab-By') === 'claude' ? 'claude' : 'finlay')
  const fail = (c: Context, e: unknown, status: 400 | 500 = 400) => c.json({ error: e instanceof Error ? e.message : String(e) }, status)

  app.get('/', (c) => c.html(page(), 200, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }))
  app.use('/api/*', async (c, next) => {
    const address = clientAddress((n) => c.req.header(n))
    const until = lockedOut.get(address)
    if (until && until > Date.now()) return c.json({ error: 'Too many wrong passwords. Try again in a few minutes.' }, 429)
    if (until) lockedOut.delete(address)
    if (!authorised(c)) {
      if (!wrongTries.hit(address)) lockedOut.set(address, Date.now() + LAB_WRONG_TRIES.windowMs)
      const delay = deps.wrongPasswordDelayMs ?? LAB_WRONG_TRIES.delayMs
      if (delay > 0) await new Promise((r) => setTimeout(r, delay))
      return c.json({ error: 'That password isn’t right.' }, 401)
    }
    await next()
  })

  async function elevenVoices() {
    if (voiceList && Date.now() - voiceList.at < 10 * 60_000) return voiceList
    const ours = GUIDES.map((g) => ({ id: g.elevenLabsVoiceId, name: `${g.name} (current)` }))
    let voices: { id: string; name: string; labels?: Record<string, string>; category?: string }[] = []
    let models: { id: string; name: string }[] = []
    if (deps.keys.elevenlabs) {
      const headers = { 'xi-api-key': deps.keys.elevenlabs }
      const [v, m] = await Promise.all([
        f('https://api.elevenlabs.io/v1/voices', { headers, signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : { voices: [] })).catch(() => ({ voices: [] })),
        f('https://api.elevenlabs.io/v1/models', { headers, signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ])
      voices = ((v as any).voices ?? []).map((x: any) => ({ id: x.voice_id, name: x.name, labels: x.labels, category: x.category })).filter((x: any) => typeof x.id === 'string')
      models = ((m as any[]) ?? []).filter((x) => x.can_do_text_to_speech !== false && typeof x.model_id === 'string').map((x) => ({ id: x.model_id, name: x.name ?? x.model_id }))
    }
    const seen = new Set(ours.map((o) => o.id))
    voiceList = { at: Date.now(), voices: [...ours, ...voices.filter((v) => !seen.has(v.id))], models }
    return voiceList
  }

  app.get('/api/options', async (c) => {
    const [eleven, catalog, spend, runs] = await Promise.all([
      elevenVoices(),
      deps.keys.elevenlabs ? fetchEffectsCatalog(deps.keys.elevenlabs, f) : Promise.resolve({ filters: [], environments: [] }),
      labSpend(deps.sql),
      listRuns(deps.sql, { limit: 1 }),
    ])
    const elevenModel = deps.elevenModel ?? 'eleven_v4_turbo'
    return c.json({
      guides: GUIDES.map((g) => ({ id: g.id, name: g.name, elevenLabsVoiceId: g.elevenLabsVoiceId, googleVoice: g.voice })),
      languages: [...LAUNCH_LANGUAGES, 'en'].filter((l, i, a) => a.indexOf(l) === i),
      sampleLines: SAMPLE_LINES,
      voices: {
        elevenlabs: { available: Boolean(deps.keys.elevenlabs), defaultModel: elevenModel, models: eleven.models.length ? eleven.models : [{ id: elevenModel, name: elevenModel }], voices: eleven.voices, perHourUSD: voicePerHourUSD('elevenlabs', elevenModel) },
        chirp: { available: Boolean(deps.keys.googleTts), voices: GOOGLE_VOICES, perHourUSD: voicePerHourUSD('chirp', '') },
        gemini: { available: Boolean(deps.keys.gemini), models: Object.keys(GEMINI_TTS), voices: GOOGLE_VOICES, perHourUSD: Object.fromEntries(Object.keys(GEMINI_TTS).map((m) => [m, voicePerHourUSD('gemini', m)])) },
      },
      textModels: TEXT_MODELS.map((m) => ({
        id: m.id,
        label: m.label,
        note: m.note,
        available: m.provider === 'anthropic' ? Boolean(deps.keys.anthropic) : Boolean(deps.keys.gemini),
        perMillionUSD: { in: m.price(1000).in * 1e6, out: m.price(1000).out * 1e6 },
      })),
      sounds: Object.entries(SOUND_PRESETS).map(([id, s]) => ({ id, label: s.label, note: s.note })),
      elevenEffects: roomSettings(catalog).filter((s) => s.effects).map((s) => ({ label: s.label, note: s.note, effects: s.effects })),
      spend: spend ?? null,
      saving: runs.saving,
    })
  })

  // Voice studio: lines × takes, blind or named on the page.
  app.post('/api/voice', async (c) => {
    try {
      const body = await c.req.json()
      const nativeLanguage = String(body.nativeLanguage ?? 'en').slice(0, 5)
      const targetLanguage = String(body.targetLanguage ?? 'sv').slice(0, 5)
      const lines = (Array.isArray(body.lines) ? body.lines : []).map((l: unknown) => String(l ?? '').trim()).filter(Boolean).slice(0, LIMITS.lines)
      if (!lines.length) throw new Error('Add at least one line')
      if (lines.some((l: string) => l.length > LIMITS.lineChars)) throw new Error(`Keep each line under ${LIMITS.lineChars} characters`)
      const takes: (Take & { label: string })[] = (Array.isArray(body.takes) ? body.takes : []).slice(0, LIMITS.takes).map((t: any, i: number) => ({ ...cleanTake(t), label: String(t?.label ?? `Take ${i + 1}`).slice(0, 60) }))
      if (!takes.length) throw new Error('Add at least one voice')
      const estimate = takes.map((t) => ({ label: t.label, usd: lines.reduce((a: number, l: string) => a + estimateVoiceUSD(t.provider, t.model ?? '', l.replace(/\[\[|\]\]/g, '').length), 0) }))
      if (body.estimate) return c.json({ estimate, totalUSD: estimate.reduce((a, e) => a + e.usd, 0) })
      const results: unknown[][] = []
      let cost = 0
      for (const line of lines) {
        const row: unknown[] = []
        for (const t of takes) {
          try {
            const { label, ...take } = t
            const r = await voiceAndStore(take, { text: line, nativeLanguage, targetLanguage }, { keys: deps.keys, storage: deps.storage, fetchImpl: f, elevenModel: deps.elevenModel })
            cost += r.costUSD
            row.push({ label, url: r.url, durationSec: r.durationSec, costUSD: r.costUSD, cached: r.cached })
          } catch (e) {
            row.push({ label: t.label, error: e instanceof Error ? e.message : String(e) })
          }
        }
        results.push(row)
      }
      const runId = await saveRun(deps.sql, { kind: 'voice', title: String(body.title ?? lines[0]).slice(0, 120), config: { lines, nativeLanguage, targetLanguage, takes }, results, costUSD: cost, by: by(c) })
      return c.json({ runId, results, costUSD: cost })
    } catch (e) {
      return fail(c, e)
    }
  })

  app.get('/api/episodes', async (c) => c.json({ episodes: await labEpisodes(deps.sql) }))

  app.get('/api/episodes/:id', async (c) => {
    const id = c.req.param('id')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Not found' }, 404)
    const ep = await loadEpisode(deps.sql, id, c.req.query('guide'))
    if (!ep) return c.json({ error: 'Not found' }, 404)
    return c.json({
      id: ep.id,
      title: ep.title,
      podcastTitle: ep.podcastTitle,
      language: ep.language,
      nativeLanguage: ep.nativeLanguage,
      guide: ep.guideId,
      durationSec: ep.transcript.segments.at(-1)?.end ?? 0,
      synced: Boolean(ep.plan.syncUrl),
      moments: [...ep.plan.moments].sort((a, b) => a.at - b.at).map(momentSummary),
    })
  })

  const episodeFor = async (body: any) => {
    const id = String(body.episodeId ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Pick an episode')
    const ep = await loadEpisode(deps.sql, id, body.guide ? guideById(String(body.guide)).id : undefined)
    if (!ep) throw new Error('That episode has no lesson plan')
    return ep
  }

  // Guide moments heard in place, and the same with different sound settings ("In the room").
  app.post('/api/moment', async (c) => {
    try {
      const body = await c.req.json()
      const ep = await episodeFor(body)
      const momentId = String(body.momentId ?? '')
      const m = ep.plan.moments.find((x) => x.id === momentId)
      if (!m) throw new Error('Pick a moment')
      const variants: MomentVariant[] = (Array.isArray(body.variants) ? body.variants : [{ label: 'Stored' }]).slice(0, LIMITS.variants).map((v: any, i: number) => ({
        label: String(v?.label ?? `Version ${i + 1}`).slice(0, 60),
        ...(v?.take ? { take: cleanTake(v.take) } : {}),
        ...(typeof v?.sound === 'string' ? { sound: v.sound } : {}),
        ...(typeof v?.script === 'string' && v.script.trim() ? { script: v.script.slice(0, 2000) } : {}),
      }))
      const speechChars = (script: string) => splitScript(script).reduce((a, p) => a + (p.kind === 'speech' ? p.text.replace(/\[\[|\]\]/g, '').length : 0), 0)
      const estimate = variants.map((v) => ({ label: v.label, usd: v.take ? estimateVoiceUSD(v.take.provider, v.take.model ?? '', speechChars(v.script ?? m.script)) : 0 }))
      if (body.estimate) return c.json({ estimate, totalUSD: estimate.reduce((a, e) => a + e.usd, 0), note: 'Re-voicing costs the voice only; stored lines are free. The first preview of an episode downloads it, which can take a minute.' })
      const episode = await episodeAudio(ep, { download: deps.download, fingerprint: deps.fingerprint, fetchImpl: f })
      const out: unknown[] = []
      let cost = 0
      for (const v of variants) {
        try {
          const r = await renderMoment(ep, episode, momentId, v, { keys: deps.keys, storage: deps.storage, fetchImpl: f, elevenModel: deps.elevenModel }, { leadSec: Number(body.leadSec ?? 8), tailSec: Number(body.tailSec ?? 6) })
          cost += r.costUSD
          const renderId = randomUUID()
          for (const [k, x] of renders) if (x.expires < Date.now()) renders.delete(k)
          while (renders.size >= MAX_RENDERS) renders.delete(renders.keys().next().value!)
          renders.set(renderId, { mp3: r.mp3, expires: Date.now() + RENDER_TTL_MS })
          const { mp3: _mp3, ...info } = r
          out.push({ label: v.label, renderId, ...info, take: v.take, sound: v.sound, script: v.script })
        } catch (e) {
          out.push({ label: v.label, error: e instanceof Error ? e.message : String(e) })
        }
      }
      const kind: RunKind = body.kind === 'room' ? 'room' : 'moment'
      const runId = await saveRun(deps.sql, { kind, title: `${ep.podcastTitle}: ${ep.title} · ${m.kind} at ${Math.floor(m.at / 60)}:${String(Math.floor(m.at % 60)).padStart(2, '0')}`, config: { episodeId: ep.id, guide: ep.guideId, momentId, variants, leadSec: body.leadSec, tailSec: body.tailSec }, results: out, costUSD: cost, by: by(c) })
      return c.json({ runId, renders: out, costUSD: cost, synced: episode.synced })
    } catch (e) {
      return fail(c, e)
    }
  })

  // "Mia steps in" as a vertical video (PC-1029-10): the stored moment with the show's artwork, the host's
  // subtitles and Mia's card. Stored lines only, so it costs nothing. Kept in memory like previews, never stored.
  app.post('/api/moment/video', async (c) => {
    try {
      const body = await c.req.json()
      const ep = await episodeFor(body)
      const momentId = String(body.momentId ?? '')
      const m = ep.plan.moments.find((x) => x.id === momentId)
      if (!m) throw new Error('Pick a moment')
      const episode = await episodeAudio(ep, { download: deps.download, fingerprint: deps.fingerprint, fetchImpl: f })
      const r = await renderMoment(ep, episode, momentId, { label: 'Stored' }, { keys: deps.keys, storage: deps.storage, fetchImpl: f, elevenModel: deps.elevenModel }, { leadSec: Number(body.leadSec ?? 5), tailSec: Number(body.tailSec ?? 4) })
      const [row] = await deps.sql`select coalesce(e.image, p.artwork) as image from episodes e join podcasts p on p.id = e.podcast_id where e.id = ${ep.id}`
      const artwork = await fetchArtwork(row?.image, { fetch: f, lookupHost: deps.lookupHost })
      const mp4 = await (deps.renderVideo ?? renderMomentVideo)({
        mp3: r.mp3,
        durationSec: r.durationSec,
        captions: momentCaptions(r.pieces, ep.transcript.segments, m.script),
        showTitle: ep.podcastTitle,
        guideName: guideById(ep.guideId).name,
        artwork,
      })
      const videoId = randomUUID()
      for (const [k, x] of videos) if (x.expires < Date.now()) videos.delete(k)
      while (videos.size >= MAX_VIDEOS) videos.delete(videos.keys().next().value!)
      const name = `polycast-${ep.podcastTitle}-${Math.floor(m.at / 60)}m${String(Math.floor(m.at % 60)).padStart(2, '0')}s`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)
      videos.set(videoId, { mp4, name, expires: Date.now() + RENDER_TTL_MS })
      return c.json({ videoId, durationSec: Math.min(VIDEO_MAX_SEC, r.durationSec), bytes: mp4.byteLength, warnings: r.warnings })
    } catch (e) {
      return fail(c, e)
    }
  })
  app.get('/api/video/:id', (c) => {
    const v = videos.get(c.req.param('id'))
    if (!v || v.expires < Date.now()) return c.json({ error: 'That video has expired; make it again.' }, 404)
    return c.body(Buffer.from(v.mp4), 200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Content-Length': String(v.mp4.byteLength), 'Content-Disposition': `inline; filename="${v.name}.mp4"` })
  })

  // Previews hold episode audio, so they're kept in memory for half an hour and never stored.
  app.get('/api/render/:id', (c) => {
    const r = renders.get(c.req.param('id'))
    if (!r || r.expires < Date.now()) return c.json({ error: 'That preview has expired; run it again.' }, 404)
    return c.body(Buffer.from(r.mp3), 200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'Content-Length': String(r.mp3.byteLength) })
  })

  const modelsFrom = (body: any) => {
    const models = (Array.isArray(body.models) ? body.models : []).map(String).filter((m: string) => TEXT_MODELS.some((t) => t.id === m)).slice(0, LIMITS.models)
    if (!models.length) throw new Error('Pick at least one model')
    return models as string[]
  }

  app.post('/api/scripts', async (c) => {
    try {
      const body = await c.req.json()
      const ep = await episodeFor(body)
      const models = modelsFrom(body)
      const momentId = String(body.momentId ?? '')
      const instruction = typeof body.instruction === 'string' ? body.instruction.slice(0, LIMITS.instructionChars) : undefined
      if (body.estimate) {
        const estimate = estimateScriptUSD(ep, momentId, models, instruction)
        return c.json({ estimate, totalUSD: estimate.reduce((a, e) => a + e.usd, 0) })
      }
      const r = await compareScripts(ep, momentId, models, instruction, deps.keys, f)
      const cost = r.results.reduce((a, x) => a + x.costUSD, 0)
      const runId = await saveRun(deps.sql, { kind: 'script', title: `${ep.title} · ${momentId}${instruction ? ` · ${instruction.slice(0, 60)}` : ''}`, config: { episodeId: ep.id, guide: ep.guideId, momentId, models, instruction }, results: r, costUSD: cost, by: by(c) })
      return c.json({ runId, ...r, costUSD: cost })
    } catch (e) {
      return fail(c, e)
    }
  })

  app.post('/api/plans', async (c) => {
    try {
      const body = await c.req.json()
      const ep = await episodeFor(body)
      const models = modelsFrom(body)
      const minutes = Math.max(0, Math.min(240, Number(body.minutes ?? 10) || 0))
      if (body.estimate) {
        const estimate = estimatePlanUSD(ep, minutes, models)
        return c.json({ estimate, totalUSD: estimate.reduce((a, e) => a + e.usd, 0) })
      }
      const results = await comparePlans(ep, models, minutes, deps.keys, f)
      const cost = results.reduce((a, x) => a + x.costUSD, 0)
      // The full plans are large; the run keeps the readable pages and numbers.
      const saved = results.map(({ plan: _plan, ...r }) => r)
      const runId = await saveRun(deps.sql, { kind: 'plan', title: `${ep.podcastTitle}: ${ep.title} · ${minutes ? `first ${minutes} min` : 'whole episode'}`, config: { episodeId: ep.id, guide: ep.guideId, models, minutes }, results: saved, costUSD: cost, by: by(c) })
      return c.json({ runId, results: saved, costUSD: cost })
    } catch (e) {
      return fail(c, e)
    }
  })

  app.get('/api/runs', async (c) => {
    const kind = c.req.query('kind') as RunKind | undefined
    const ok = !kind || ['voice', 'moment', 'room', 'script', 'plan'].includes(kind)
    return c.json(await listRuns(deps.sql, { kind: ok ? kind : undefined, limit: Number(c.req.query('limit') ?? 50) }))
  })
  app.get('/api/runs/:id', async (c) => {
    const id = c.req.param('id')
    const run = /^[0-9a-f-]{36}$/i.test(id) ? await getRun(deps.sql, id) : undefined
    return run ? c.json(run) : c.json({ error: 'Not found' }, 404)
  })
  app.post('/api/runs/:id/pick', async (c) => {
    const id = c.req.param('id')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Not found' }, 404)
    const body = await c.req.json().catch(() => ({}))
    const ok = await pickRun(deps.sql, id, body.pick ?? null, typeof body.note === 'string' ? body.note : undefined)
    return ok ? c.json({ ok }) : c.json({ error: 'Not found' }, 404)
  })

  return app
}
