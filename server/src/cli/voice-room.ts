/**
 * Mia in the show's room (PC-1019-10): voices a few guide lines for Mia and Leo dry and with two or
 * three gentle ElevenLabs audio effects, into ./voice-room, each line's takes side by side. Stops at
 * DAILY_CAP_USD (default $0.50); a full run is a few cents. Nothing changes for learners.
 *
 *   ELEVENLABS_API_KEY=… pnpm --filter @polycast/server voice-room
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { memoryLedger, SpendGuard } from '../budget'
import { resolveElevenModel } from '../providers/elevenlabs'
import { elevenRoomTake, fetchEffectsCatalog, roomSettings, runRoomAudition } from '../roomAudition'

async function main() {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('Set ELEVENLABS_API_KEY')
  const model = await resolveElevenModel(key, process.env.ELEVENLABS_TTS_MODEL || undefined)
  const settings = roomSettings(await fetchEffectsCatalog(key))
  for (const s of settings) console.log(`${s.label}: ${s.note}`)
  if (settings.length === 1) console.log('The effects catalog had nothing gentle to try, so only the dry takes are voiced.')
  const out = join(process.cwd(), 'voice-room')
  await mkdir(out, { recursive: true })
  const takes = await runRoomAudition({
    take: (req) => elevenRoomTake(key, { ...req, model }),
    settings,
    save: (file, bytes) => writeFile(join(out, file), bytes),
    guard: new SpendGuard(memoryLedger(), Number(process.env.DAILY_CAP_USD ?? 0.5)),
  })
  for (const t of takes) console.log(t.file)
  console.log(`Listen in ${out}: each line's takes sit together. Tell Claude which one, if any, Mia and Leo should use.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
