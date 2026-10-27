/**
 * Polycast server: the API the app calls and the worker that prepares episodes, in one process.
 * Configuration comes from environment variables; see .env.example.
 */
import { serve } from '@hono/node-server'
import { downloadEpisode, ffmpegAacEncoder, ffmpegFingerprint, ffmpegLoudness } from './audio'
import { createApi, supabaseVerifier } from './api'
import { connect, forgetOldRemovalRequests, releaseJob } from './db'
import { ELEVEN_TTS_MODEL, elevenLabsSpeech, resolveElevenModel, scribeTranscriber } from './providers/elevenlabs'
import { chooseTtsProvider, withFallbackSpeech } from './providers/speechChoice'
import { elevenVoiceFor } from './voices'
import { GEMINI_MODELS, geminiSpeech, geminiText } from './providers/gemini'
import { pretranslateDiscover } from './translations'
import { LAUNCH_LANGUAGES } from '@polycast/core'
import { geminiBatchText } from './providers/geminiBatch'
import { googleChirpSpeech } from './providers/googleTts'
import type { Storage } from './providers/types'
import { Agent, setGlobalDispatcher } from 'undici'
import { perMinute } from './retry'
import { jobsInProgress, workLoop } from './worker'
import { READY_PUSH_TITLE, refreshFinishedShows, sendFirstListenNudges, sendNudges, type Push } from './nudges'

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
      body: JSON.stringify({ to: token, title: READY_PUSH_TITLE, body: title, data: { episodeId } }),
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

  const translateText = geminiText(gemini, GEMINI_MODELS.textLite)
  // "Use your own API keys" (PC-1017-K1) is on once OWN_KEYS_SECRET (32 random bytes, base64) is set.
  const ownKeysSecret = process.env.OWN_KEYS_SECRET || undefined
  // Optional calibration of the own-keys cost estimate (PC-1017-K4), from logged preparations. Default 1.
  const factor = (v: string | undefined) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 1)
  const ownKeysCalibration = { elevenlabs: factor(process.env.OWN_KEYS_ELEVEN_FACTOR), google: factor(process.env.OWN_KEYS_GOOGLE_FACTOR) }
  const storage = supabaseStorage(supabaseUrl, need('SUPABASE_SERVICE_ROLE_KEY'))
  // The Lab (PC-1021-L1): Finlay's test page on /lab, on only when LAB_TOKEN is set.
  const lab = process.env.LAB_TOKEN
    ? {
        sql,
        token: process.env.LAB_TOKEN,
        keys: { elevenlabs: process.env.ELEVENLABS_API_KEY, googleTts: process.env.GOOGLE_TTS_API_KEY, gemini, anthropic: process.env.ANTHROPIC_API_KEY },
        storage,
        download: downloadEpisode(),
        fingerprint: ffmpegFingerprint(),
        elevenModel: process.env.ELEVENLABS_TTS_MODEL || undefined,
      }
    : undefined
  const api = createApi({ sql, verify: supabaseVerifier(supabaseUrl), fetch, podcastIndex, alert, text: geminiText(gemini), translateText, ownKeysSecret, ownKeysCalibration, revenueCatSecret: process.env.REVENUECAT_WEBHOOK_SECRET, funnelToken: process.env.FUNNEL_TOKEN, lab })
  const port = Number(process.env.PORT ?? 8787)
  serve({ fetch: api.fetch, port })
  console.log(`Polycast API on :${port}`)
  // The guide's voice (PC-1017-09): ElevenLabs Eleven v4 Turbo unless TTS_PROVIDER says otherwise,
  // with Chirp 3 HD (when its key is set) reading any line ElevenLabs refuses outright.
  const ttsProvider = chooseTtsProvider(process.env)
  const chirp = process.env.GOOGLE_TTS_API_KEY
    ? pacedSpeech(googleChirpSpeech(process.env.GOOGLE_TTS_API_KEY, ffmpegAacEncoder()), Number(process.env.GOOGLE_TTS_RPM ?? 150))
    : undefined
  let speech
  if (ttsProvider === 'elevenlabs') {
    const elevenKey = need('ELEVENLABS_API_KEY')
    const model = await resolveElevenModel(elevenKey, process.env.ELEVENLABS_TTS_MODEL || undefined)
    const eleven = pacedSpeech(elevenLabsSpeech(elevenKey, ffmpegAacEncoder(), { model, voiceId: elevenVoiceFor }), Number(process.env.ELEVENLABS_TTS_RPM ?? 120))
    speech = withFallbackSpeech(eleven, chirp, (m) => void alert?.('voice', `ElevenLabs refused a guide line, Chirp read it instead: ${m.slice(0, 200)}`).catch(() => {}))
    console.log(`Guide voice: ElevenLabs (${model})${chirp ? ', Chirp 3 HD as fallback' : ''}`)
  } else if (ttsProvider === 'chirp') {
    speech = chirp!
    console.log('Guide voice: Google Cloud TTS (Chirp 3 HD)')
  } else {
    speech = pacedSpeech(geminiSpeech(gemini, ffmpegAacEncoder()), Number(process.env.GEMINI_TTS_RPM ?? 9))
    console.log('Guide voice: Gemini TTS')
  }

  const stopping = new AbortController()
  if (process.env.RUN_WORKER !== 'false') {
    void workLoop({
      sql,
      fetch,
      transcriber: scribeTranscriber(need('ELEVENLABS_API_KEY')),
      text: geminiText(gemini),
      // Re-plans after a guide update go through Gemini's batch service at half price (PC-1015-07).
      batchText: process.env.GEMINI_BATCH === 'false' ? undefined : (maxWaitMs) => geminiBatchText(gemini, undefined, fetch, { maxWaitMs }),
      speech,
      storage,
      downloadAudio: downloadEpisode(),
      fingerprint: ffmpegFingerprint(),
      loudness: ffmpegLoudness(),
      alert,
      notifyReady: expoPush(async (id) => (await sql`select push_token from profiles where id = ${id}`)[0]?.push_token ?? undefined),
      // Learners' own keys (PC-1017-K1): their ElevenLabs key for Scribe and the guide's voice, their
      // Google key for the writing. Never Polycast's keys, and no Chirp fallback.
      ownKeys: ownKeysSecret
        ? {
            secret: ownKeysSecret,
            providers: (k) => ({
              transcriber: scribeTranscriber(k.elevenlabs),
              speech: pacedSpeech(elevenLabsSpeech(k.elevenlabs, ffmpegAacEncoder(), { model: ELEVEN_TTS_MODEL, voiceId: elevenVoiceFor }), Number(process.env.ELEVENLABS_TTS_RPM ?? 120)),
              text: geminiText(k.gemini),
            }),
          }
        : undefined,
    }, { signal: stopping.signal })
    console.log('Worker running')

    // New-episode nudges: every 3 hours, re-read finished shows' feeds, then send what's due.
    const nudgeRound = async () => {
      try {
        await refreshFinishedShows(sql, fetch)
        const sent = await sendNudges(sql, expoSend)
        if (sent) console.log(`Sent ${sent} new-episode nudges`)
        // One nudge, ever, for a learner who hasn't started a guided episode a day after signing up (PC-1026-09).
        const first = await sendFirstListenNudges(sql, expoSend)
        if (first) console.log(`Sent ${first} first-listen nudges`)
      } catch (e) {
        console.error('nudge round failed', e)
      }
    }
    const nudgeTimer = setInterval(() => void nudgeRound(), 3 * 60 * 60_000)
    stopping.signal.addEventListener('abort', () => clearInterval(nudgeTimer))

    // Shared translations of the day's Discover pool (PC-1017-T1): 15 minutes after start, then daily.
    const translateRound = async () => {
      try {
        const n = await pretranslateDiscover({ sql, text: translateText, fetch, podcastIndex }, LAUNCH_LANGUAGES)
        console.log(`Discover pool translated (${n} titles and descriptions checked)`)
      } catch (e) {
        console.error('translation round failed', e)
      }
    }
    const firstTranslate = setTimeout(() => void translateRound(), 15 * 60_000)
    const translateTimer = setInterval(() => void translateRound(), 24 * 60 * 60_000)
    stopping.signal.addEventListener('abort', () => (clearTimeout(firstTranslate), clearInterval(translateTimer)))

    // Creators' removal requests are forgotten 12 months after they're handled (PC-1017-10): daily.
    const forgetRound = async () => {
      try {
        const n = await forgetOldRemovalRequests(sql)
        if (n) console.log(`Deleted ${n} removal requests handled over 12 months ago`)
      } catch (e) {
        console.error('removal request clean-up failed', e)
      }
    }
    const firstForget = setTimeout(() => void forgetRound(), 20 * 60_000)
    const forgetTimer = setInterval(() => void forgetRound(), 24 * 60 * 60_000)
    stopping.signal.addEventListener('abort', () => (clearTimeout(firstForget), clearInterval(forgetTimer)))
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
