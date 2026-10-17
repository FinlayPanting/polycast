import { costUSD, voiceSegments, ZERO_USAGE } from '@polycast/core'
import { SpendGuard, UsageMeter } from './budget'
import { TARGET_SPEAKING_RATE } from './providers/googleTts'
import type { SpeechSynth } from './providers/types'
import { withRetry } from './retry'
import { GUIDES, type Guide } from './voices'

/**
 * A pronunciation regression set for the guide voice (board item PC-1017-09): guide lines in English
 * with target-language words inside them, the way lesson plans write them, for every launch language
 * plus plain English. Run by hand after a voice or model change and listen for any target word said
 * with an English accent:
 *
 *   ELEVENLABS_API_KEY=… pnpm --filter @polycast/server voice-check
 */
export const PRONUNCIATION_LINES: { language: string; line: string }[] = [
  { language: 'en', line: "So far: the two hosts have been arguing about whether a summer house counts as a holiday. Here's Alex:" },
  { language: 'en', line: 'Quick question. What did Sigge say he forgot to bring?' },
  { language: 'sv', line: 'Swedes call a coffee break [[fika]], and they take it very seriously.' },
  { language: 'sv', line: "Here's Anna. [[försenad]]. It means delayed. You might say: [[Tåget är försenat igen]], the train's late again." },
  { language: 'sv', line: 'Listen for [[sjuttiosju]], seventy-seven, and [[kärlek]], love.' },
  { language: 'de', line: "In German, the moment work ends has its own word: [[Feierabend]]. You'll hear it on Fridays." },
  { language: 'de', line: "That was Jonas. [[Ich bin total fertig]]. It means I'm completely worn out." },
  { language: 'de', line: 'Two little words you hear all the time: [[genau]] and [[eigentlich]].' },
  { language: 'fr', line: 'When a French host says [[on y va]], they mean let’s go.' },
  { language: 'fr', line: "Here's Claire. [[grenouille]]. A frog. And [[écureuil]], a squirrel." },
  { language: 'es', line: 'A friendly hello in Spain is [[¿qué tal?]], how’s it going?' },
  { language: 'es', line: "Listen out for [[ferrocarril]], railway, and [[desarrollar]], to develop." },
  { language: 'it', line: 'Half the sentences you hear start with [[allora]], so or well then.' },
  { language: 'it', line: "Here's Marco. [[gli gnocchi]]. And the double letters in [[pizza]] and [[anno]]." },
  { language: 'pt', line: 'There’s no easy English word for [[saudade]], a longing for something gone.' },
  { language: 'pt', line: "Here's Inês. [[não]]. And [[obrigado]], or [[obrigada]] if you're a woman." },
]

export interface PronunciationTake {
  file: string
  language: string
  guide: string
  text: string
  durationSec: number
}

/** Voices every line for every guide, the same way lesson plans are voiced, and saves each segment. */
export async function runPronunciationCheck(deps: { speech: SpeechSynth; save: (file: string, bytes: Uint8Array) => Promise<void>; guard: SpendGuard; guides?: Guide[] }): Promise<PronunciationTake[]> {
  const takes: PronunciationTake[] = []
  const mixed = Boolean(deps.speech.mixedLanguage)
  for (const guide of deps.guides ?? GUIDES) {
    for (const [n, { language, line }] of PRONUNCIATION_LINES.entries()) {
      const ledgerId = `voice-check-${guide.id}-${n}`
      await deps.guard.reserve(ledgerId, Math.max(0.001, costUSD({ ...ZERO_USAGE, elevenTtsChars: line.length, ttsChars: line.length })))
      const meter = new UsageMeter()
      try {
        for (const [k, seg] of voiceSegments(line, { mixed }).entries()) {
          const lang = seg.target ? language : 'en'
          const spoken = await withRetry(() => deps.speech.synthesize({ text: seg.text, voice: guide.voice, style: guide.style, language: lang, rate: seg.target ? TARGET_SPEAKING_RATE : undefined, mixed: mixed && !seg.target }))
          meter.add(spoken.usage)
          const ext = spoken.mimeType === 'audio/mp4' ? 'm4a' : spoken.mimeType === 'audio/mpeg' ? 'mp3' : 'wav'
          const file = `${String(n + 1).padStart(2, '0')}-${language}-${guide.id}-${k + 1}.${ext}`
          await deps.save(file, spoken.audio)
          takes.push({ file, language, guide: guide.id, text: seg.text, durationSec: spoken.durationSec })
        }
      } finally {
        await deps.guard.settle(ledgerId, meter.usage)
      }
    }
  }
  return takes
}
