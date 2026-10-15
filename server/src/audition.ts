import { pricesOn } from '@polycast/core'
import { SpendGuard } from './budget'
import type { SpeechSynth } from './providers/types'
import { GEMINI_MODELS } from './providers/gemini'
import { GUIDES, type Guide } from './voices'
import { withRetry } from './retry'

/**
 * A side-by-side audition of the guide voice on Gemini 3.8 Flash TTS and the cheaper Flash-Lite TTS
 * (board item PC-1013-03): the same Mia and Leo lines on both models, so Finlay can hear whether the
 * cheaper voice is good enough. Run with `pnpm --filter @polycast/server audition-voices`.
 */
export const AUDITION_LINES = [
  'So far: the two hosts have been arguing about whether a summer house counts as a holiday. Alex thinks it’s just more housework.',
  'Here’s a word you’ll hear a lot: fika. It’s a coffee break, usually with something sweet, and Swedes take it very seriously.',
  'Quick question. What did Sigge say he forgot to bring?',
]

export const AUDITION_MODELS = [
  { id: GEMINI_MODELS.tts, label: 'flash', priceKey: 'ttsPerAudioSec' },
  { id: GEMINI_MODELS.ttsLite, label: 'flash-lite', priceKey: 'ttsLitePerAudioSec' },
] as const

export interface AuditionTake {
  model: string
  guide: string
  line: number
  file: string
  durationSec: number
}

export interface AuditionSummary {
  model: string
  audioSec: number
  /** What an hour of guide speech costs on this model now and from 1 Jan 2027. */
  perHourNowUSD: number
  perHour2027USD: number
}

export async function runAudition(deps: {
  speechFor: (model: string) => SpeechSynth
  save: (file: string, bytes: Uint8Array) => Promise<void>
  guard: SpendGuard
  guides?: Guide[]
  lines?: string[]
  now?: Date
}): Promise<{ takes: AuditionTake[]; summary: AuditionSummary[] }> {
  const guides = deps.guides ?? GUIDES
  const lines = deps.lines ?? AUDITION_LINES
  const now = deps.now ?? new Date()
  const takes: AuditionTake[] = []
  for (const model of AUDITION_MODELS) {
    const speech = deps.speechFor(model.id)
    // Roughly 15 characters a second; reserve against the cap before each model's run.
    const audioSec = (guides.length * lines.join(' ').length) / 15
    await deps.guard.reserve(`audition-${model.label}`, audioSec * pricesOn(now)[model.priceKey] * 2)
    let spoken = 0
    for (const guide of guides) {
      for (const [i, text] of lines.entries()) {
        const r = await withRetry(() => speech.synthesize({ text, voice: guide.voice, style: guide.style, language: 'en' }))
        const ext = r.mimeType === 'audio/mp4' ? 'm4a' : r.mimeType === 'audio/mpeg' ? 'mp3' : 'wav'
        const file = `${String(i + 1).padStart(2, '0')}-${guide.id}-${model.label}.${ext}`
        await deps.save(file, r.audio)
        takes.push({ model: model.id, guide: guide.id, line: i + 1, file, durationSec: r.durationSec })
        spoken += r.durationSec
      }
    }
    // Usage has no Flash-Lite field: record Lite audio as the Flash seconds that cost the same.
    await deps.guard.settle(`audition-${model.label}`, { transcriptionSec: 0, textInTokens: 0, textOutTokens: 0, ttsAudioSec: model.label === 'flash' ? spoken : spoken * (pricesOn(now).ttsLitePerAudioSec / pricesOn(now).ttsPerAudioSec) })
  }
  const summary = AUDITION_MODELS.map((m) => ({
    model: m.id,
    audioSec: takes.filter((t) => t.model === m.id).reduce((a, t) => a + t.durationSec, 0),
    perHourNowUSD: 3600 * pricesOn(now)[m.priceKey],
    perHour2027USD: 3600 * pricesOn(new Date(Date.UTC(2027, 0, 1)))[m.priceKey],
  }))
  return { takes, summary }
}
