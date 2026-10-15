/**
 * Voices the same Mia and Leo lines with Gemini 3.8 Flash TTS and Flash-Lite TTS, into ./audition,
 * with files named so each line's two takes sit side by side. Stops at DAILY_CAP_USD (default $0.50).
 *
 *   GEMINI_API_KEY=… pnpm --filter @polycast/server audition-voices
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ffmpegAacEncoder } from '../audio'
import { runAudition } from '../audition'
import { memoryLedger, SpendGuard } from '../budget'
import { geminiSpeech } from '../providers/gemini'

async function main() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('Set GEMINI_API_KEY')
  const out = join(process.cwd(), 'audition')
  await mkdir(out, { recursive: true })
  const { takes, summary } = await runAudition({
    speechFor: (model) => geminiSpeech(key, ffmpegAacEncoder(), model),
    save: (file, bytes) => writeFile(join(out, file), bytes),
    guard: new SpendGuard(memoryLedger(), Number(process.env.DAILY_CAP_USD ?? 0.5)),
  })
  for (const t of takes) console.log(`${t.file}  ${t.durationSec.toFixed(1)} s`)
  for (const s of summary) console.log(`${s.model}: $${s.perHourNowUSD.toFixed(2)} an hour of guide speech now, $${s.perHour2027USD.toFixed(2)} from 1 Jan 2027`)
  console.log(`Listen in ${out}: each line's flash and flash-lite takes sit next to each other.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
