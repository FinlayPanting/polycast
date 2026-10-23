import { alignFingerprints, guideVolume, MIN_SYNC_COVERAGE, retimeLesson, type GuideMoment, type LessonPlan, type Transcript } from '@polycast/core'
import type { Sql } from '../db'
import { splitScript } from '../pipeline/voice'
import type { Storage } from '../providers/types'
import { HANDOVER, cutEpisode, joinWavs, loudnessOf, scaleWav, silence, fadeWav, toMp3, isSoundPreset, type SoundPreset, runFfmpeg, lineChain, LAB_RATE, fixWavSizes } from './sound'
import { decodeToWav, voiceAndStore, type LabKeys, type Take } from './voice'
import { wavDurationSec } from '../audio'

/**
 * The guide moment preview (PC-1021-L1, after PC-1014-F2): a stretch of a prepared episode with a
 * guide moment in it, joined into one file the way the phone plays it (the host fades out, a breath,
 * the guide and the host's clips with the app's gaps, then the episode picks up two seconds back
 * and fades in). Mia's lines can be the stored ones or re-voiced with any take, so voices, sound
 * settings and scripts can be heard in place without a build.
 *
 * The episode is downloaded into memory only and kept for half an hour for further previews; the
 * finished preview is sent to the page and never stored (episode audio is never re-hosted).
 */

export interface EpisodeForLab {
  id: string
  title: string
  podcastTitle: string
  audioUrl: string
  language: string
  nativeLanguage: string
  transcript: Transcript
  plan: LessonPlan
  guideId: string
}

export async function loadEpisode(sql: Sql, episodeId: string, guideId?: string): Promise<EpisodeForLab | undefined> {
  const [row] = await sql`
    select e.id, e.title, p.title as podcast_title, e.audio_url, e.language, t.native_language, t.source, t.words, t.segments, l.plan, l.guide_id
    from episodes e join podcasts p on p.id = e.podcast_id
    join transcripts t on t.episode_id = e.id
    join lesson_plans l on l.episode_id = e.id
    where e.id = ${episodeId}
    order by (l.guide_id = ${guideId ?? ''}) desc, l.created_at desc
    limit 1`
  if (!row) return undefined
  return {
    id: row.id,
    title: row.title,
    podcastTitle: row.podcast_title,
    audioUrl: row.audio_url,
    language: row.language,
    nativeLanguage: row.native_language,
    transcript: { language: row.language, source: row.source, words: row.words, segments: row.segments },
    plan: row.plan,
    guideId: row.guide_id,
  }
}

/** Ready episodes with lesson plans, newest first, for the page's picker. */
export async function labEpisodes(sql: Sql, limit = 60) {
  return sql`
    select e.id, e.title, p.title as podcast_title, e.language, e.duration_sec, e.ready_at,
      array_agg(distinct l.guide_id) as guides
    from episodes e join podcasts p on p.id = e.podcast_id join lesson_plans l on l.episode_id = e.id
    where e.status = 'ready'
    group by e.id, p.title
    order by e.ready_at desc nulls last
    limit ${limit}`
}

/** The page's view of a moment: what it is, when, and what's said. */
export function momentSummary(m: GuideMoment) {
  return {
    id: m.id,
    kind: m.kind,
    at: m.at,
    minLevel: m.minLevel,
    script: m.script,
    term: m.term ? { text: (m.term as any).text, meaning: (m.term as any).meaning } : undefined,
    clips: m.clips.length,
    stored: Boolean(m.audio?.parts.length),
    durationSec: m.audio?.durationSec,
  }
}

interface CachedEpisode {
  audio: Uint8Array
  /** The episode's lesson re-timed onto this copy, when its adverts differ from the one transcribed. */
  plan: LessonPlan
  synced: 'aligned' | 'same' | 'unchecked'
  expires: number
}

const EPISODE_TTL_MS = 30 * 60_000
const cache = new Map<string, CachedEpisode>()

/** Only one episode is held at a time: they can be over 100 MB. */
export async function episodeAudio(
  ep: EpisodeForLab,
  deps: { download: (url: string) => Promise<Uint8Array>; fingerprint?: (audio: Uint8Array) => Promise<Uint8Array>; fetchImpl?: typeof fetch; now?: () => number },
): Promise<CachedEpisode> {
  const now = deps.now?.() ?? Date.now()
  const key = `${ep.id}:${ep.guideId}`
  const hit = cache.get(key)
  if (hit && hit.expires > now) return hit
  cache.clear()
  const audio = await deps.download(ep.audioUrl)
  let plan = ep.plan
  let synced: CachedEpisode['synced'] = 'unchecked'
  // Line the lesson up with this copy, as the phone does, if the reference fingerprint was saved.
  if (ep.plan.syncUrl && deps.fingerprint) {
    try {
      const ref = await (deps.fetchImpl ?? fetch)(ep.plan.syncUrl)
      if (ref.ok) {
        const map = alignFingerprints(new Uint8Array(await ref.arrayBuffer()), await deps.fingerprint(audio))
        if (map.coverage >= MIN_SYNC_COVERAGE) {
          const r = retimeLesson(ep.transcript, ep.plan, map)
          if (r.plan) plan = r.plan
          synced = map.segments.length > 1 ? 'aligned' : 'same'
        }
      }
    } catch {
      // A failed alignment leaves the original timings; the page says so.
    }
  }
  const entry = { audio, plan, synced, expires: now + EPISODE_TTL_MS }
  cache.set(key, entry)
  return entry
}

export interface MomentVariant {
  label: string
  /** Re-voice the guide's lines with this take; without one, the lines the app has stored are used. */
  take?: Take
  /** A sound setting for the stored lines (a re-voiced take carries its own). */
  sound?: SoundPreset
  /** A rewritten script to voice instead of the stored one (needs a take). */
  script?: string
}

export interface PreviewPiece {
  kind: 'episode' | 'guide' | 'clip' | 'pause'
  start: number
  durationSec: number
  /** Where in the episode, for episode and clip pieces. */
  from?: number
  text?: string
}

export interface MomentPreview {
  mp3: Uint8Array
  durationSec: number
  pieces: PreviewPiece[]
  costUSD: number
  /** Loudness of the episode just before, and of the guide's speech, as heard (LUFS). */
  episodeLufs?: number
  guideLufs?: number
  synced: CachedEpisode['synced']
  warnings: string[]
}

/** Stored guide audio as a Lab WAV, with an optional sound setting on top. */
async function storedLine(url: string, sound: SoundPreset, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`Couldn't fetch the stored guide line (${res.status})`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (sound === 'dry') return (await decodeToWav(bytes)).wav
  const { out } = await runFfmpeg(['-loglevel', 'error', '-i', 'pipe:0', '-af', lineChain(sound), '-ar', String(LAB_RATE), '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav', '-rf64', 'never', 'pipe:1'], bytes)
  return fixWavSizes(out)
}

/** Builds the guide's part of a moment: speech and host clips in order, with the app's gaps. */
export async function renderMoment(
  ep: EpisodeForLab,
  episode: CachedEpisode,
  momentId: string,
  variant: MomentVariant,
  deps: { keys: LabKeys; storage: Storage; fetchImpl?: typeof fetch; elevenModel?: string },
  opts: { leadSec?: number; tailSec?: number } = {},
): Promise<MomentPreview> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const m = episode.plan.moments.find((x) => x.id === momentId)
  if (!m) throw new Error('That moment isn’t in this lesson plan')
  const lead = Math.min(30, Math.max(0, opts.leadSec ?? 8))
  const tail = Math.min(30, Math.max(0, opts.tailSec ?? 6))
  const warnings: string[] = []
  const gain = guideVolume(episode.plan.loudnessLufs)
  let costUSD = 0

  // The guide's steps: speech (stored or re-voiced) and clips of the host.
  type Step = { kind: 'speech'; wav: Uint8Array; text?: string } | { kind: 'clip'; start: number; end: number }
  const steps: Step[] = []
  if (variant.take) {
    for (const piece of splitScript(variant.script?.trim() || m.script)) {
      if (piece.kind === 'clip') {
        const c = m.clips[piece.clipIndex]
        if (c) steps.push({ kind: 'clip', start: c.start, end: c.end })
        continue
      }
      const take = { ...variant.take }
      const v = await voiceAndStore(take, { text: piece.text, nativeLanguage: episode.plan.nativeLanguage, targetLanguage: episode.plan.targetLanguage }, deps)
      costUSD += v.costUSD
      const wav = v.wav ?? (await decodeToWav(new Uint8Array(await (await fetchImpl(v.url)).arrayBuffer()))).wav
      steps.push({ kind: 'speech', wav, text: piece.text })
    }
  } else {
    if (variant.script?.trim()) throw new Error('A rewritten script needs a voice to read it')
    if (!m.audio?.parts.length) throw new Error('This moment has no stored audio yet; pick a voice to voice it')
    const sound = isSoundPreset(variant.sound) ? variant.sound : 'dry'
    for (const p of m.audio.parts) {
      if (p.kind === 'clip') {
        const c = m.clips[p.clipIndex]
        if (c) steps.push({ kind: 'clip', start: c.start, end: c.end })
      } else steps.push({ kind: 'speech', wav: await storedLine(p.url, sound, fetchImpl) })
    }
  }

  const pieces: PreviewPiece[] = []
  const wavs: Uint8Array[] = []
  let t = 0
  const add = (piece: Omit<PreviewPiece, 'start' | 'durationSec'>, wav: Uint8Array) => {
    const d = wavDurationSec(wav)
    pieces.push({ ...piece, start: t, durationSec: d })
    wavs.push(wav)
    t += d
  }

  // The episode up to the moment, fading out as the app does.
  const at = m.at
  if (lead > 0 && at > 0) {
    const before = await cutEpisode(episode.audio, Math.max(0, at - lead), at)
    add({ kind: 'episode', from: Math.max(0, at - lead) }, fadeWav(before, 0, HANDOVER.fadeOutSec))
  }
  add({ kind: 'pause' }, silence(HANDOVER.breathBeforeSec))
  const guideWavs: Uint8Array[] = []
  for (const [i, s] of steps.entries()) {
    const prev = steps[i - 1]
    if (prev) add({ kind: 'pause' }, silence(s.kind === 'clip' ? HANDOVER.gapBeforeClipSec : prev.kind === 'clip' ? HANDOVER.gapAfterClipSec : 0.12))
    if (s.kind === 'speech') {
      const w = scaleWav(s.wav, gain)
      guideWavs.push(w)
      add({ kind: 'guide', text: s.text }, w)
    } else {
      const from = Math.max(0, s.start - HANDOVER.clipLeadSec)
      add({ kind: 'clip', from }, await cutEpisode(episode.audio, from, s.end + HANDOVER.clipTailSec))
    }
  }
  add({ kind: 'pause' }, silence(HANDOVER.breathAfterSec))
  // Back to the episode two seconds before where it stopped, fading in (not after the warm-up at 0).
  if (tail > 0) {
    const back = at > HANDOVER.pickUpBeforeSec + 1 ? at - HANDOVER.pickUpBeforeSec : at
    const after = await cutEpisode(episode.audio, back, back + tail + (at - back))
    add({ kind: 'episode', from: back }, fadeWav(after, HANDOVER.fadeInSec, 0))
  }

  if (!steps.some((s) => s.kind === 'speech')) warnings.push('This moment has no guide speech.')
  const joined = joinWavs(wavs)
  const [episodeLufs, guideLufs] = await Promise.all([
    lead > 3 && at > 3 ? loudnessOf(wavs[0]!) : Promise.resolve(undefined),
    guideWavs.length ? loudnessOf(joinWavs(guideWavs)) : Promise.resolve(undefined),
  ])
  if (episodeLufs !== undefined && guideLufs !== undefined && Math.abs(episodeLufs - guideLufs) > 4) {
    warnings.push(`The guide is ${Math.abs(guideLufs - episodeLufs).toFixed(1)} LU ${guideLufs > episodeLufs ? 'louder' : 'quieter'} than the episode around it.`)
  }
  if (episode.synced === 'unchecked') warnings.push('Timings are the transcribed copy’s; this download wasn’t checked against it (adverts may shift things).')
  return { mp3: await toMp3(joined), durationSec: t, pieces, costUSD, episodeLufs, guideLufs, synced: episode.synced, warnings }
}
