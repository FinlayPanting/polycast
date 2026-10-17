/**
 * The pronunciation check (src/pronunciation.ts): voices every line for Mia and Leo with the guide's
 * current voice into ./voice-check. Stops at DAILY_CAP_USD (default $0.50); a full run is about 5 cents.
 *
 *   ELEVENLABS_API_KEY=… pnpm --filter @polycast/server voice-check
 *   (TTS_PROVIDER=chirp with GOOGLE_TTS_API_KEY=… to hear the Chirp fallback instead)
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ffmpegAacEncoder } from '../audio'
import { memoryLedger, SpendGuard } from '../budget'
import { elevenLabsSpeech, resolveElevenModel } from '../providers/elevenlabs'
import { googleChirpSpeech } from '../providers/googleTts'
import { chooseTtsProvider } from '../providers/speechChoice'
import { runPronunciationCheck } from '../pronunciation'
import { elevenVoiceFor } from '../voices'

async function main() {
  const provider = chooseTtsProvider(process.env)
  let speech
  if (provider === 'elevenlabs') {
    const key = process.env.ELEVENLABS_API_KEY!
    const model = await resolveElevenModel(key, process.env.ELEVENLABS_TTS_MODEL || undefined)
    console.log(`ElevenLabs, ${model}`)
    speech = elevenLabsSpeech(key, ffmpegAacEncoder(), { model, voiceId: elevenVoiceFor })
  } else if (provider === 'chirp') {
    console.log('Chirp 3 HD')
    speech = googleChirpSpeech(process.env.GOOGLE_TTS_API_KEY!, ffmpegAacEncoder())
  } else throw new Error('Set ELEVENLABS_API_KEY (or TTS_PROVIDER=chirp with GOOGLE_TTS_API_KEY)')
  const out = join(process.cwd(), 'voice-check')
  await mkdir(out, { recursive: true })
  const takes = await runPronunciationCheck({ speech, save: (file, bytes) => writeFile(join(out, file), bytes), guard: new SpendGuard(memoryLedger(), Number(process.env.DAILY_CAP_USD ?? 0.5)) })
  for (const t of takes) console.log(`${t.file}  ${t.durationSec.toFixed(1)} s  ${t.text}`)
  console.log(`Listen in ${out}: any target word with an English accent is a regression.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
