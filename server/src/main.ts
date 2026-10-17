/**
 * Polycast server: the API the app calls and the worker that prepares episodes, in one process.
 * Configuration comes from environment variables; see .env.example.
 */
import { serve } from '@hono/node-server'
import { downloadEpisode, ffmpegAacEncoder, ffmpegFingerprint } from './audio'
import { createApi, supabaseVerifier } from './api'
import { connect, releaseJob } from './db'
import { scribeTranscriber } from './providers/elevenlabs'
import { geminiSpeech, geminiText } from './providers/gemini'
import { geminiBatchText } from './providers/geminiBatch'
import { googleChirpSpeech } from './providers/googleTts'
import type { Storage } from './providers/types'
import { Agent, setGlobalDispatcher } from 'undici'
import { perMinute } from './retry'
import { jobsInProgress, workLoop } from './worker'
import { refreshFinishedShows, sendNudges, type Push } from './nudges'

// Node's fetch gives up if a reply takes over 5 minutes to start. Transcribing a long episode
// can take longer than that, so allow 20 minutes.
setGlobalDispatcher(new Agent({ headersTimeout: 20 * 60_000, bodyTimeout: 20 * 60_000 }))

function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing environment variable ${name}`)
  return v
}

/** Supabase Storage, in a public bucket: guide audio is shared by every learner of an episode. */
function supabaseStorage(url: string, serviceKey: string, bucket = 'guide-audio'): Storage {
  return {
    async put(path, bytes, contentType) {
      const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': contentType, 'x-upsert': 'true' },
        body: bytes,
      })
      if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`)
      return `${url}/storage/v1/object/public/${bucket}/${path}`
    },
    async exists(path) {
      const publicUrl = `${url}/storage/v1/object/public/${bucket}/${path}`
      const res = await fetch(publicUrl, { method: 'HEAD' })
      return res.ok ? publicUrl : undefined
    },
  }
}

/** Alerts for Finlay go to a webhook (ntfy.sh, Slack or similar) when ALERT_WEBHOOK_URL is set. */
function webhookAlert(url: string | undefined) {
  return async (kind: string, message: string) => {
    console.log(`[alert:${kind}] ${message}`)
    if (url) await fetch(url, { method: 'POST', headers: { Title: `Polycast: ${kind}` }, body: message })
  }
}

/** "Your episode is ready" through Expo's push service. */
function expoPush(sqlLookup: (userId: string) => Promise<string | undefined>) {
  return async (userId: string, title: string, episodeId: string) => {
    const token = await sqlLookup(userId)
    if (!token) return
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: token, title: 'Your episode is ready', body: title, data: { episodeId } }),
    })
  }
}

/** Any notification through Expo's push service. */
const expoSend: Push = async (to, title, body, data) => {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, title, body, data }),
  })
  if (!res.ok) throw new Error(`Expo push failed: ${res.status}`)
}

/** Keeps the guide's voice requests under the provider's per-minute limit. */
function pacedSpeech<S extends { synthesize: (...a: any[]) => Promise<any> }>(speech: S, rpm: number): S {
  return { ...speech, synthesize: perMinute(speech.synthesize.bind(speech), rpm) }
}

async function main() {
  const sql = connect(need('DATABASE_URL'))
  const supabaseUrl = need('SUPABASE_URL')
  const gemini = need('GEMINI_API_KEY')
  const alert = webhookAlert(process.env.ALERT_WEBHOOK_URL)
  const podcastIndex = process.env.PODCAST_INDEX_KEY ? { key: process.env.PODCAST_INDEX_KEY, secret: need('PODCAST_INDEX_SECRET') } : undefined

  const api = createApi({ sql, verify: supabaseVerifier(supabaseUrl), fetch, podcastIndex, alert, text: geminiText(gemini), revenueCatSecret: process.env.REVENUECAT_WEBHOOK_SECRET, funnelToken: process.env.FUNNEL_TOKEN })
  const port = Number(process.env.PORT ?? 8787)
  serve({ fetch: api.fetch, port })
  console.log(`Polycast API on :${port}`)
  console.log(`Guide voice: ${process.env.GOOGLE_TTS_API_KEY ? 'Google Cloud TTS (Chirp 3 HD)' : 'Gemini TTS'}`)

  const stopping = new AbortController()
  if (process.env.RUN_WORKER !== 'false') {
    void workLoop({
      sql,
      fetch,
      transcriber: scribeTranscriber(need('ELEVENLABS_API_KEY')),
      text: geminiText(gemini),
      // Re-plans after a guide update go through Gemini's batch service at half price (PC-1015-07).
      batchText: process.env.GEMINI_BATCH === 'false' ? undefined : (maxWaitMs) => geminiBatchText(gemini, undefined, fetch, { maxWaitMs }),
      // Chirp 3 HD voices (Google Cloud TTS, 200 requests a minute) when its key is set; otherwise
      // Gemini's voices, which AI Studio caps at 10 a minute and 100 a day on Tier 1.
      speech: process.env.GOOGLE_TTS_API_KEY
        ? pacedSpeech(googleChirpSpeech(process.env.GOOGLE_TTS_API_KEY, ffmpegAacEncoder()), Number(process.env.GOOGLE_TTS_RPM ?? 150))
        : pacedSpeech(geminiSpeech(gemini, ffmpegAacEncoder()), Number(process.env.GEMINI_TTS_RPM ?? 9)),
      storage: supabaseStorage(supabaseUrl, need('SUPABASE_SERVICE_ROLE_KEY')),
      downloadAudio: downloadEpisode(),
      fingerprint: ffmpegFingerprint(),
      alert,
      notifyReady: expoPush(async (id) => (await sql`select push_token from profiles where id = ${id}`)[0]?.push_token ?? undefined),
    }, { signal: stopping.signal })
    console.log('Worker running')

    // New-episode nudges: every 3 hours, re-read finished shows' feeds, then send what's due.
    const nudgeRound = async () => {
      try {
        await refreshFinishedShows(sql, fetch)
        const sent = await sendNudges(sql, expoSend)
        if (sent) console.log(`Sent ${sent} new-episode nudges`)
      } catch (e) {
        console.error('nudge round failed', e)
      }
    }
    const nudgeTimer = setInterval(() => void nudgeRound(), 3 * 60 * 60_000)
    stopping.signal.addEventListener('abort', () => clearInterval(nudgeTimer))
  }

  // Railway stops the old server on every deploy. Hand an unfinished job back to the queue so
  // the new server picks it up, instead of leaving it "running" with nobody working on it.
  const shutdown = async (signal: string) => {
    stopping.abort()
    const jobs = jobsInProgress()
    console.log(`${signal}: shutting down${jobs.length ? `, returning ${jobs.join(', ')} to the queue` : ''}`)
    for (const job of jobs) await releaseJob(sql, job).catch((e) => console.error('could not release job', e))
    await sql.end({ timeout: 5 }).catch(() => {})
    process.exit(0)
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
