import { normalizeToken, pricesOn, type ShowNames, type Word } from '@polycast/core'
import { scribeTranscriber } from '../providers/elevenlabs'
import { errorFromResponse, type Transcriber } from '../providers/types'
import { withRetry } from '../retry'
import type { EpisodeForLab } from './moment'
import type { LabKeys } from './voice'

/**
 * Transcription audition (PC-1026-04): the start of one prepared episode run through Mistral's Voxtral Mini
 * Transcribe 3 and through ElevenLabs Scribe (what the pipeline uses) side by side, with how far the two agree,
 * which of the show's names each spelt right, the language each heard, and the cost of each per hour.
 * Lab only: learners' episodes are untouched until a later card changes TRANSCRIBER.
 *
 * The clip is cut in memory from the episode the Lab already downloads and is never stored.
 */

/** Voxtral Mini Transcribe 3 (20 Oct 2026): $0.0035 a minute, about $0.21 an hour (Mistral's launch price). */
export const VOXTRAL_TRANSCRIBE_MODEL = 'voxtral-mini-transcribe-3'
export const VOXTRAL_PER_MIN_USD = 0.0035
/** Mistral takes up to 100 words or phrases to bias towards. */
export const VOXTRAL_CONTEXT_MAX = 100

/**
 * Gladia Solaria-3 (PC-1029-09): Gladia's most accurate model for European languages, pre-recorded only. Self-serve
 * price €0.16 an hour (Gladia, 27 Oct 2026), taken here as $0.19 (about 1.16 dollars to the euro).
 */
export const GLADIA_TRANSCRIBE_MODEL = 'solaria-3'
export const GLADIA_PER_HOUR_USD = 0.19
/** How long the Lab waits for Gladia to finish a clip before giving up. */
export const GLADIA_MAX_WAIT_MS = 5 * 60_000

export type TranscribeProvider = 'scribe' | 'voxtral' | 'gladia'
export const TRANSCRIBE_PROVIDERS: TranscribeProvider[] = ['scribe', 'voxtral', 'gladia']

/** What each provider costs for an hour of audio, name hints included. */
export function transcribePerHourUSD(provider: TranscribeProvider, at?: Date): number {
  if (provider === 'voxtral') return VOXTRAL_PER_MIN_USD * 60
  if (provider === 'gladia') return GLADIA_PER_HOUR_USD
  const p = pricesOn(at)
  return (p.transcriptionPerSec + p.transcriptEditPerSec) * 3600
}

export function transcribeCostUSD(provider: TranscribeProvider, seconds: number, at?: Date): number {
  return (transcribePerHourUSD(provider, at) / 3600) * Math.max(0, seconds)
}

/** The show's title, hosts and recurring names as Mistral's context bias: unique, trimmed, at most 100. */
export function contextBias(names: ShowNames | undefined): string[] {
  if (!names) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [names.showTitle, ...names.hosts, ...names.names]) {
    const n = String(raw ?? '').replace(/\s+/g, ' ').trim()
    if (!n || n.length > 60 || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    out.push(n)
  }
  return out.slice(0, VOXTRAL_CONTEXT_MAX)
}

/**
 * Timed words from Mistral's reply. Word timestamps when it gives them; otherwise each segment's words share
 * its time evenly (good enough to compare text, not for subtitles).
 */
export function wordsFromVoxtral(body: unknown): Word[] {
  const b = body as any
  const words: any[] = Array.isArray(b?.words) ? b.words : []
  if (words.length) {
    return words
      .map((w) => ({ text: String(w?.word ?? w?.text ?? '').trim(), start: Number(w?.start), end: Number(w?.end), ...(w?.speaker_id ? { speaker: String(w.speaker_id) } : {}) }))
      .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end))
  }
  const segments: any[] = Array.isArray(b?.segments) ? b.segments : []
  const out: Word[] = []
  for (const s of segments) {
    const parts = String(s?.text ?? '').split(/\s+/).filter(Boolean)
    const start = Number(s?.start)
    const end = Number(s?.end)
    if (!parts.length || !Number.isFinite(start) || !Number.isFinite(end)) continue
    const step = Math.max(0, end - start) / parts.length
    parts.forEach((text, i) => out.push({ text, start: start + i * step, end: start + (i + 1) * step, ...(s?.speaker_id ? { speaker: String(s.speaker_id) } : {}) }))
  }
  if (!out.length && typeof b?.text === 'string') return b.text.split(/\s+/).filter(Boolean).map((text: string) => ({ text, start: 0, end: 0 }))
  return out
}

/**
 * Mistral Voxtral speech to text (`POST /v1/audio/transcriptions`), uploading the clip. Mistral won't take a
 * language together with timestamps, so it detects the language itself; the page shows what it heard, which is
 * how Swedish gets checked. The show's names go in as context bias.
 */
export function voxtralTranscriber(apiKey: string, fetchImpl: typeof fetch = fetch, model = VOXTRAL_TRANSCRIBE_MODEL): Transcriber {
  return {
    async transcribe({ audioUrl, audio, durationSec, names }) {
      const form = new FormData()
      form.set('model', model)
      if (audio) form.set('file', new Blob([audio as BlobPart], { type: 'audio/mpeg' }), 'clip.mp3')
      else form.set('file_url', audioUrl)
      form.append('timestamp_granularities', 'word')
      form.set('diarize', 'true')
      for (const n of contextBias(names)) form.append('context_bias', n)
      const res = await fetchImpl('https://api.mistral.ai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form })
      if (!res.ok) throw errorFromResponse('Mistral Voxtral', res.status, await res.text())
      const json = (await res.json()) as { language?: string; usage?: { prompt_audio_seconds?: number } }
      const words = wordsFromVoxtral(json)
      return { words, detectedLanguage: json.language ?? undefined, usage: { transcriptionSec: json.usage?.prompt_audio_seconds ?? Math.max(durationSec, words.at(-1)?.end ?? 0) } }
    },
  }
}

/** Timed words from a finished Gladia job: every utterance's words, in order. */
export function wordsFromGladia(body: unknown): Word[] {
  const utterances: any[] = (body as any)?.result?.transcription?.utterances ?? []
  const out: Word[] = []
  for (const u of Array.isArray(utterances) ? utterances : []) {
    for (const w of Array.isArray(u?.words) ? u.words : []) {
      const text = String(w?.word ?? '').trim()
      const start = Number(w?.start)
      const end = Number(w?.end)
      if (text && Number.isFinite(start) && Number.isFinite(end)) out.push({ text, start, end, ...(u?.speaker != null ? { speaker: String(u.speaker) } : {}) })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/**
 * Gladia speech to text (`/v2/upload`, then `/v2/pre-recorded`, polled until done) with Solaria-3. No language is
 * given, so it detects one (the page shows what it heard: the Swedish check). The show's names go in as custom
 * vocabulary.
 */
export function gladiaTranscriber(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  opts: { model?: string; pollMs?: number; maxWaitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Transcriber {
  const headers = { 'x-gladia-key': apiKey }
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const json = async (res: Response) => {
    if (!res.ok) throw errorFromResponse('Gladia', res.status, await res.text())
    return (await res.json()) as any
  }
  return {
    async transcribe({ audioUrl, audio, durationSec, names }) {
      let url = audioUrl
      if (audio) {
        const form = new FormData()
        form.set('audio', new Blob([audio as BlobPart], { type: 'audio/mpeg' }), 'clip.mp3')
        url = (await json(await fetchImpl('https://api.gladia.io/v2/upload', { method: 'POST', headers, body: form }))).audio_url
      }
      const vocabulary = contextBias(names)
      const job = await json(
        await fetchImpl('https://api.gladia.io/v2/pre-recorded', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_url: url, model: opts.model ?? GLADIA_TRANSCRIBE_MODEL, ...(vocabulary.length ? { custom_vocabulary: true, custom_vocabulary_config: { vocabulary } } : {}) }),
        }),
      )
      const resultUrl: string = job.result_url ?? `https://api.gladia.io/v2/pre-recorded/${job.id}`
      const deadline = Date.now() + (opts.maxWaitMs ?? GLADIA_MAX_WAIT_MS)
      for (;;) {
        const r = await json(await fetchImpl(resultUrl, { headers }))
        if (r.status === 'done') {
          const words = wordsFromGladia(r)
          const seconds = Number(r.result?.metadata?.audio_duration)
          return { words, detectedLanguage: r.result?.transcription?.languages?.[0] ?? undefined, usage: { transcriptionSec: Number.isFinite(seconds) ? seconds : Math.max(durationSec, words.at(-1)?.end ?? 0) } }
        }
        if (r.status === 'error') throw new Error(`Gladia couldn't transcribe the clip${r.error_code ? ` (${r.error_code})` : ''}`)
        if (Date.now() > deadline) throw new Error('Gladia took too long to transcribe the clip')
        await sleep(opts.pollMs ?? 2000)
      }
    },
  }
}

const tokens = (words: Word[], language: string) => words.map((w) => normalizeToken(w.text, language)).filter(Boolean)

/** Word error rate of `hyp` against `ref` (edits over reference words), on normalised words. */
export function wordErrorRate(ref: string[], hyp: string[]): number {
  if (!ref.length) return hyp.length ? 1 : 0
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j)
  for (let i = 1; i <= ref.length; i++) {
    const cur = [i]
    for (let j = 1; j <= hyp.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (ref[i - 1] === hyp[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[hyp.length]! / ref.length
}

/** Which of the show's names appear in a transcript, spelt exactly (ignoring case). */
export function namesSpelt(words: Word[], names: string[]): { name: string; found: boolean }[] {
  const text = ` ${words.map((w) => w.text).join(' ').toLowerCase().replace(/[.,!?;:"“”«»()]/g, ' ').replace(/\s+/g, ' ')} `
  return names.map((name) => ({ name, found: text.includes(` ${name.toLowerCase()} `) }))
}

export interface TranscribeResult {
  provider: TranscribeProvider
  label: string
  ok: boolean
  error?: string
  text?: string
  words?: number
  detectedLanguage?: string
  /** Agreement with Scribe's transcript of the same clip, 0 to 1 (1 minus word error rate); on Scribe, with the one other when there are only two. */
  agreement?: number
  names?: { name: string; found: boolean }[]
  seconds?: number
  costUSD: number
  perHourUSD: number
}

export const TRANSCRIBE_LABEL: Record<TranscribeProvider, string> = { scribe: 'ElevenLabs Scribe v2 (now)', voxtral: 'Mistral Voxtral Mini Transcribe 3', gladia: 'Gladia Solaria-3' }

/** What a comparison of `seconds` of audio will cost. */
export function estimateTranscribeUSD(seconds: number, at?: Date) {
  const estimate = TRANSCRIBE_PROVIDERS.map((p) => ({ label: TRANSCRIBE_LABEL[p], usd: transcribeCostUSD(p, seconds, at) }))
  return { estimate, totalUSD: estimate.reduce((a, e) => a + e.usd, 0) }
}

/**
 * Runs the clip through each (Scribe, Voxtral, Gladia), one after the other. A provider that isn't set up, or fails, shows its error and
 * costs nothing; the other still runs.
 */
export async function compareTranscription(
  ep: Pick<EpisodeForLab, 'audioUrl' | 'language'>,
  clip: { mp3: Uint8Array; seconds: number },
  names: ShowNames | undefined,
  keys: LabKeys,
  opts: { fetchImpl?: typeof fetch; transcribers?: Partial<Record<TranscribeProvider, Transcriber>>; now?: () => number } = {},
): Promise<TranscribeResult[]> {
  const f = opts.fetchImpl ?? fetch
  const now = opts.now ?? Date.now
  const nameList = contextBias(names).filter((n) => n !== names?.showTitle)
  const make = (p: TranscribeProvider): Transcriber | string => {
    if (opts.transcribers?.[p]) return opts.transcribers[p]!
    if (p === 'scribe') return keys.elevenlabs ? scribeTranscriber(keys.elevenlabs, f) : 'Scribe isn’t set up on the server (ELEVENLABS_API_KEY).'
    if (p === 'gladia') return keys.gladia ? gladiaTranscriber(keys.gladia, f) : 'Gladia isn’t set up on the server (GLADIA_API_KEY).'
    return keys.mistral ? voxtralTranscriber(keys.mistral, f) : 'Mistral isn’t set up on the server (MISTRAL_API_KEY).'
  }
  const results: TranscribeResult[] = []
  const heard: Partial<Record<TranscribeProvider, string[]>> = {}
  for (const p of TRANSCRIBE_PROVIDERS) {
    const base = { provider: p, label: TRANSCRIBE_LABEL[p], perHourUSD: transcribePerHourUSD(p) }
    const t = make(p)
    if (typeof t === 'string') {
      results.push({ ...base, ok: false, error: t, costUSD: 0 })
      continue
    }
    const started = now()
    try {
      const r = await withRetry(() => t.transcribe({ audioUrl: ep.audioUrl, language: ep.language, durationSec: clip.seconds, audio: clip.mp3, names }))
      heard[p] = tokens(r.words, ep.language)
      results.push({
        ...base,
        ok: true,
        text: r.words.map((w) => w.text).join(' '),
        words: r.words.length,
        detectedLanguage: r.detectedLanguage,
        names: namesSpelt(r.words, nameList),
        seconds: Math.round((now() - started) / 100) / 10,
        costUSD: transcribeCostUSD(p, clip.seconds),
      })
    } catch (e) {
      results.push({ ...base, ok: false, error: e instanceof Error ? e.message : String(e), costUSD: 0 })
    }
  }
  const round = (n: number) => Math.round(Math.max(0, n) * 1000) / 1000
  if (heard.scribe) {
    const others = results.filter((r) => r.ok && r.provider !== 'scribe')
    for (const r of others) r.agreement = round(1 - wordErrorRate(heard.scribe, heard[r.provider]!))
    const scribe = results.find((r) => r.provider === 'scribe')
    if (scribe && others.length === 1) scribe.agreement = others[0]!.agreement
  }
  return results
}
