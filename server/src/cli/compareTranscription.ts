/**
 * Transcribes the same 10-minute clip with Scribe directly and through OpenRouter, then compares
 * word timings, names and cost (board item PC-1014-05).
 *
 *   ELEVENLABS_API_KEY=… OPENROUTER_API_KEY=… pnpm --filter @polycast/server compare-transcription <episode mp3 url> <language>
 *
 * The clip is cut on this machine and never stored. Stops if the estimate is over DAILY_CAP_USD (default $0.50).
 */
import { spawn } from 'node:child_process'
import { pricesOn } from '@polycast/core'
import { downloadEpisode } from '../audio'
import { openrouterScribeTranscriber } from '../providers/openrouter'
import { scribeTranscriber } from '../providers/elevenlabs'
import { compareTranscripts, timingsSurvive } from '../transcriptionCompare'

const CLIP_SEC = 600

function firstMinutes(bytes: Uint8Array, seconds: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-t', String(seconds), '-vn', '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', 'pipe:1'])
    const out: Buffer[] = []
    ff.stdout.on('data', (d) => out.push(d))
    ff.on('error', reject)
    ff.on('close', (code) => (code === 0 ? resolve(new Uint8Array(Buffer.concat(out))) : reject(new Error(`ffmpeg exited ${code}`))))
    ff.stdin.on('error', () => {})
    ff.stdin.end(Buffer.from(bytes))
  })
}

async function main() {
  const [url, language = 'sv'] = process.argv.slice(2)
  const eleven = process.env.ELEVENLABS_API_KEY
  const openrouter = process.env.OPENROUTER_API_KEY
  if (!url || !eleven || !openrouter) throw new Error('Usage: ELEVENLABS_API_KEY=… OPENROUTER_API_KEY=… compare-transcription <episode mp3 url> [language]')
  const directUSD = CLIP_SEC * pricesOn(new Date()).transcriptionPerSec
  const cap = Number(process.env.DAILY_CAP_USD ?? 0.5)
  if (directUSD * 2 > cap) throw new Error(`Estimated $${(directUSD * 2).toFixed(2)} is over the $${cap} cap`)

  const clip = await firstMinutes(await downloadEpisode()(url), CLIP_SEC)
  const input = { audioUrl: url, language, durationSec: CLIP_SEC, audio: clip }
  const via = openrouterScribeTranscriber(openrouter)
  const [direct, routed] = await Promise.all([scribeTranscriber(eleven).transcribe(input), via.transcribe(input)])
  const c = compareTranscripts(direct.words, routed.words)

  console.log(`Words: Scribe ${c.wordsA}, OpenRouter ${c.wordsB}; ${(c.matchedShare * 100).toFixed(1)}% matched`)
  console.log(`Word start difference: median ${(c.medianStartDiffSec * 1000).toFixed(0)} ms, 95th percentile ${(c.p95StartDiffSec * 1000).toFixed(0)} ms`)
  console.log(`Names only Scribe has: ${c.namesOnlyInA.join(', ') || 'none'}`)
  console.log(`Names only OpenRouter has: ${c.namesOnlyInB.join(', ') || 'none'}`)
  console.log(`Cost for ${CLIP_SEC / 60} minutes: Scribe about $${directUSD.toFixed(3)}, OpenRouter $${via.lastCostUSD?.toFixed(3) ?? 'not reported'}`)
  console.log(timingsSurvive(c) ? 'Timings survive: safe to set TRANSCRIBER=openrouter.' : 'Timings drift: keep Scribe direct.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
