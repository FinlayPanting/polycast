import { costUSD, LAUNCH_LANGUAGES, voiceSegments, type Usage } from '@polycast/core'
import type { SpendGuard } from './budget'
import { UsageMeter } from './budget'
import { TARGET_SPEAKING_RATE } from './providers/googleTts'
import type { SpeechSynth, Storage } from './providers/types'
import { withRetry } from './retry'
import { DEFAULT_GUIDE, type Guide } from './voices'

/**
 * The guide's welcome (board item PC-1013-01, Finlay's call 14 Oct 2026): once a learner has picked a
 * language, Mia says hello in their own language, explains what Polycast does and slips in a couple
 * of words in the language they're learning. Voiced once per language pair, ahead of time, by the
 * worker on start-up and stored as fixed audio, so nothing is generated while anyone listens.
 *
 * Bump WELCOME_VERSION when a script changes: the new version is voiced once on the next start-up.
 * Target-language words sit in [[ ]] and are read by the same voice in that language.
 */
/** 2 (17 Oct 2026): voiced again by Eleven v4 Turbo. */
export const WELCOME_VERSION = 2

/** Learners' own language. Polycast speaks English for now (spec: Languages). */
export const WELCOME_NATIVE = 'en'

export const WELCOME_SCRIPTS: Record<(typeof LAUNCH_LANGUAGES)[number], string> = {
  es:
    "Hi, I'm Mia. With Polycast you learn Spanish from real podcasts, the ones people actually listen to. The hosts do the talking. When they pause, I step in now and then with a useful word, a quick recap or a bit of context. A word like [[¿qué tal?]], which means 'how's it going?'. Pick a show you'll enjoy, and we'll listen together.",
  fr:
    "Hi, I'm Mia. With Polycast you learn French from real podcasts, the ones people actually listen to. The hosts do the talking. When they pause, I step in now and then with a useful word, a quick recap or a bit of context. A phrase like [[on y va]], which means 'let's go'. Pick a show you'll enjoy, and we'll listen together.",
  de:
    "Hi, I'm Mia. With Polycast you learn German from real podcasts, the ones people actually listen to. The hosts do the talking. When they pause, I step in now and then with a useful word, a quick recap or a bit of context. A word like [[genau]], which means 'exactly', and which you'll hear hosts say all the time. Pick a show you'll enjoy, and we'll listen together.",
  it:
    "Hi, I'm Mia. With Polycast you learn Italian from real podcasts, the ones people actually listen to. The hosts do the talking. When they pause, I step in now and then with a useful word, a quick recap or a bit of context. A word like [[allora]], which means 'so' or 'well then', and starts half the sentences you'll hear. Pick a show you'll enjoy, and we'll listen together.",
  pt:
    "Hi, I'm Mia. With Polycast you learn Portuguese from real podcasts, the ones people actually listen to. The hosts do the talking. When they pause, I step in now and then with a useful word, a quick recap or a bit of context. A phrase like [[tudo bem?]], which means 'all good?'. Pick a show you'll enjoy, and we'll listen together.",
  sv:
    "Hi, I'm Mia. With Polycast you learn Swedish from real podcasts, the ones people actually listen to. The hosts do the talking. When they pause, I step in now and then with a useful word, a quick recap or a bit of context. A word like [[fika]], a coffee break Swedes take very seriously. Pick a show you'll enjoy, and we'll listen together.",
}

/** What the app reads: the script (with [[ ]] marks, shown in italics) and its audio, in order. */
export interface WelcomeManifest {
  version: number
  nativeLanguage: string
  targetLanguage: string
  guideId: string
  text: string
  parts: { url: string; durationSec: number }[]
}

export function welcomeDir(target: string, guide: Pick<Guide, 'id'> = DEFAULT_GUIDE): string {
  return `welcome/v${WELCOME_VERSION}/${WELCOME_NATIVE}-${target}/${guide.id}`
}

/** Public path of a pair's manifest; the app builds the same path (app/src/lib/welcome.ts). */
export function welcomeManifestPath(target: string, guide: Pick<Guide, 'id'> = DEFAULT_GUIDE): string {
  return `${welcomeDir(target, guide)}.json`
}

/** Spending cap estimate for one welcome: every character, as if voiced by a per-character voice, doubled for safety. */
function estimateUSD(script: string): number {
  return Math.max(0.01, costUSD({ transcriptionSec: 0, textInTokens: 0, textOutTokens: 0, ttsAudioSec: script.length / 15, ttsChars: script.length, elevenTtsChars: script.length } as Usage) * 2)
}

/** Voices one language's welcome and stores it. Returns the manifest. */
export async function voiceWelcome(
  target: (typeof LAUNCH_LANGUAGES)[number],
  deps: { speech: SpeechSynth; storage: Storage; guard: SpendGuard },
  guide: Guide = DEFAULT_GUIDE,
): Promise<WelcomeManifest> {
  const text = WELCOME_SCRIPTS[target]
  const ledgerId = `welcome-v${WELCOME_VERSION}-${WELCOME_NATIVE}-${target}-${guide.id}`
  await deps.guard.reserve(ledgerId, estimateUSD(text))
  const meter = new UsageMeter()
  try {
    const parts: WelcomeManifest['parts'] = []
    const mixed = Boolean(deps.speech.mixedLanguage)
    for (const run of voiceSegments(text, { mixed })) {
      const say = (language: string, rate?: number) =>
        withRetry(() => deps.speech.synthesize({ text: run.text, voice: guide.voice, style: guide.style, language, rate, mixed: mixed && !run.target }))
      const spoken = run.target ? await say(target, TARGET_SPEAKING_RATE).catch(() => say(WELCOME_NATIVE, TARGET_SPEAKING_RATE)) : await say(WELCOME_NATIVE)
      meter.add(spoken.usage)
      const ext = spoken.mimeType === 'audio/mp4' ? 'm4a' : spoken.mimeType === 'audio/mpeg' ? 'mp3' : 'wav'
      const url = await deps.storage.put(`${welcomeDir(target, guide)}-${parts.length}.${ext}`, spoken.audio, spoken.mimeType)
      parts.push({ url, durationSec: spoken.durationSec })
    }
    const manifest: WelcomeManifest = { version: WELCOME_VERSION, nativeLanguage: WELCOME_NATIVE, targetLanguage: target, guideId: guide.id, text, parts }
    // The manifest goes last, so the app never finds one pointing at audio that isn't there yet.
    await deps.storage.put(welcomeManifestPath(target, guide), new TextEncoder().encode(JSON.stringify(manifest)), 'application/json')
    return manifest
  } finally {
    await deps.guard.settle(ledgerId, meter.usage)
  }
}

/**
 * Voices any welcome not yet stored for this version. Runs on start-up; a language that fails (or
 * the spending cap) is tried again on the next start. Returns the languages voiced.
 */
export async function ensureWelcomeAudio(deps: { speech: SpeechSynth; storage: Storage; guard: SpendGuard; log?: (m: string) => void }): Promise<string[]> {
  const voiced: string[] = []
  // Without a way to check what's stored, it would voice everything on every start: don't.
  if (!deps.storage.exists) return voiced
  for (const target of LAUNCH_LANGUAGES) {
    if (await deps.storage.exists(welcomeManifestPath(target))) continue
    try {
      await voiceWelcome(target, deps)
      voiced.push(target)
    } catch (e) {
      deps.log?.(`welcome: couldn't voice ${target}: ${e instanceof Error ? e.message : e}`)
      if (e instanceof Error && e.name === 'SpendCapReached') break
    }
  }
  return voiced
}
