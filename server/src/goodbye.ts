import { costUSD, LAUNCH_LANGUAGES, TONGUE_TWISTERS, ZERO_USAGE } from '@polycast/core'
import type { SpendGuard } from './budget'
import { UsageMeter } from './budget'
import { TARGET_SPEAKING_RATE } from './providers/googleTts'
import type { SpeechSynth, Storage } from './providers/types'
import { withRetry } from './retry'
import { GUIDES, type Guide } from './voices'

/**
 * The guide's goodbye (board item PC-1015-09): at the very end of a guided episode, after the
 * wrap-up, Mia or Leo signs off in the language being learnt, with the words and their meaning on
 * screen. Voiced once per language and guide, ahead of time, by the worker on start-up (like the
 * welcome), so nothing is generated while anyone listens. Bump GOODBYE_VERSION when a line or the
 * guides' voices change; the app reads the same version (app/src/lib/goodbye.ts).
 */
/** 2 (17 Oct 2026): voiced again by Eleven v4 Turbo. */
export const GOODBYE_VERSION = 2

export const GOODBYE_LINES: Record<(typeof LAUNCH_LANGUAGES)[number], { text: string; meaning: string }> = {
  es: { text: '¡Hasta luego!', meaning: 'See you later!' },
  fr: { text: 'À plus !', meaning: 'See you!' },
  de: { text: 'Tschüss!', meaning: 'Bye!' },
  it: { text: 'Ciao, a presto!', meaning: 'Bye, see you soon!' },
  pt: { text: 'Até já!', meaning: 'See you soon!' },
  sv: { text: 'Ha det gott!', meaning: 'Take care!' },
}

/**
 * Night owl (PC-1025-06): after 11 pm in the learner's own time, the goodbye becomes a goodnight.
 * Stored beside the goodbye under `<guide>-night`, so the goodbyes already voiced stay as they are.
 */
export const GOODNIGHT_LINES: Record<(typeof LAUNCH_LANGUAGES)[number], { text: string; meaning: string }> = {
  es: { text: '¡Que descanses!', meaning: 'Rest well!' },
  fr: { text: 'Dors bien !', meaning: 'Sleep well!' },
  de: { text: 'Schlaf gut!', meaning: 'Sleep well!' },
  it: { text: 'Sogni d’oro!', meaning: 'Sweet dreams! (golden dreams)' },
  pt: { text: 'Durma bem!', meaning: 'Sleep well!' },
  sv: { text: 'Sov gott!', meaning: 'Sleep well!' },
}

/**
 * The tongue-twister (PC-1029-08) is voiced the same way, once per language and guide, under `<guide>-twister`.
 * The app plays it slowed down and then as voiced, so one clip each is enough.
 */
export type Farewell = 'goodbye' | 'goodnight' | 'twister'

const SUFFIX: Record<Farewell, string> = { goodbye: '', goodnight: '-night', twister: '-twister' }
const fileStem = (guide: Pick<Guide, 'id'>, kind: Farewell) => `${guide.id}${SUFFIX[kind]}`
const LINES: Record<Farewell, Record<(typeof LAUNCH_LANGUAGES)[number], { text: string; meaning: string }>> = { goodbye: GOODBYE_LINES, goodnight: GOODNIGHT_LINES, twister: TONGUE_TWISTERS }

export interface GoodbyeManifest {
  version: number
  targetLanguage: string
  guideId: string
  text: string
  meaning: string
  url: string
  durationSec: number
}

export function goodbyeManifestPath(target: string, guide: Pick<Guide, 'id'>, kind: Farewell = 'goodbye'): string {
  return `goodbye/v${GOODBYE_VERSION}/${target}/${fileStem(guide, kind)}.json`
}

/** Voices one goodbye in the target language, a touch slower, and stores it with its manifest. */
export async function voiceGoodbye(target: (typeof LAUNCH_LANGUAGES)[number], guide: Guide, deps: { speech: SpeechSynth; storage: Storage; guard: SpendGuard }, kind: Farewell = 'goodbye'): Promise<GoodbyeManifest> {
  const line = LINES[kind][target]
  const ledgerId = `goodbye-v${GOODBYE_VERSION}-${target}-${fileStem(guide, kind)}`
  // Every character as if voiced by a per-character voice, doubled for safety; at least a cent.
  await deps.guard.reserve(ledgerId, Math.max(0.01, costUSD({ ...ZERO_USAGE, ttsAudioSec: line.text.length / 15, ttsChars: line.text.length, elevenTtsChars: line.text.length }) * 2))
  const meter = new UsageMeter()
  try {
    const spoken = await withRetry(() => deps.speech.synthesize({ text: line.text, voice: guide.voice, style: guide.style, language: target, rate: TARGET_SPEAKING_RATE }))
    meter.add(spoken.usage)
    const ext = spoken.mimeType === 'audio/mp4' ? 'm4a' : spoken.mimeType === 'audio/mpeg' ? 'mp3' : 'wav'
    const url = await deps.storage.put(`goodbye/v${GOODBYE_VERSION}/${target}/${fileStem(guide, kind)}.${ext}`, spoken.audio, spoken.mimeType)
    const manifest: GoodbyeManifest = { version: GOODBYE_VERSION, targetLanguage: target, guideId: guide.id, text: line.text, meaning: line.meaning, url, durationSec: spoken.durationSec }
    // The manifest goes last, so the app never finds one pointing at audio that isn't there yet.
    await deps.storage.put(goodbyeManifestPath(target, guide, kind), new TextEncoder().encode(JSON.stringify(manifest)), 'application/json')
    return manifest
  } finally {
    await deps.guard.settle(ledgerId, meter.usage)
  }
}

/** Voices any goodbye, goodnight or tongue-twister not yet stored for this version, for every guide. Runs on start-up. Returns what it voiced. */
export async function ensureGoodbyeAudio(deps: { speech: SpeechSynth; storage: Storage; guard: SpendGuard; log?: (m: string) => void }): Promise<string[]> {
  const voiced: string[] = []
  if (!deps.storage.exists) return voiced
  for (const kind of ['goodbye', 'goodnight', 'twister'] as const) {
    for (const guide of GUIDES) {
      for (const target of LAUNCH_LANGUAGES) {
        if (await deps.storage.exists(goodbyeManifestPath(target, guide, kind))) continue
        try {
          await voiceGoodbye(target, guide, deps, kind)
          voiced.push(`${target}/${fileStem(guide, kind)}`)
        } catch (e) {
          deps.log?.(`${kind}: couldn't voice ${target} for ${guide.name}: ${e instanceof Error ? e.message : e}`)
          if (e instanceof Error && e.name === 'SpendCapReached') return voiced
        }
      }
    }
  }
  return voiced
}
