import type { Word } from '@polycast/core'
import { errorFromResponse, type Transcriber } from './types'

/**
 * ElevenLabs Scribe v2 through OpenRouter (board item PC-1014-05): the same model at a lower price.
 * OpenRouter takes the audio as base64 in JSON and returns word timings with `verbose_json`.
 * It has no equivalent of Scribe's name-spelling edit, so show and host names are left as heard;
 * `pnpm --filter @polycast/server compare-transcription` checks whether that matters.
 */
export function openrouterScribeTranscriber(apiKey: string, fetchImpl: typeof fetch = fetch, model = 'elevenlabs/scribe-v2'): Transcriber & { lastCostUSD?: number } {
  const t: Transcriber & { lastCostUSD?: number } = {
    async transcribe({ audioUrl, language, durationSec, audio }) {
      const bytes = audio ?? new Uint8Array(await (await fetchImpl(audioUrl)).arrayBuffer())
      const res = await fetchImpl('https://openrouter.ai/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          input_audio: { data: Buffer.from(bytes).toString('base64'), format: 'mp3' },
          language,
          response_format: 'verbose_json',
          timestamp_granularities: ['word'],
        }),
      })
      if (!res.ok) throw errorFromResponse('OpenRouter Scribe', res.status, await res.text())
      const json = (await res.json()) as { language?: string; words?: OpenRouterWord[]; usage?: { seconds?: number; cost?: number } }
      const words = wordsFromOpenRouter(json.words ?? [])
      t.lastCostUSD = json.usage?.cost
      const heardSec = Math.max(words.at(-1)?.end ?? durationSec, durationSec)
      // Counted at Scribe's direct price, so the spending cap errs on the safe side.
      return { words, detectedLanguage: json.language, usage: { transcriptionSec: heardSec } }
    },
  }
  return t
}

interface OpenRouterWord {
  word?: string
  text?: string
  start: number
  end: number
  speaker?: string
  speaker_id?: string
}

export function wordsFromOpenRouter(words: OpenRouterWord[]): Word[] {
  return words
    .map((w) => ({ text: (w.word ?? w.text ?? '').trim(), start: w.start, end: w.end, speaker: w.speaker ?? w.speaker_id }))
    .filter((w) => w.text.length > 0 && !/^\(.*\)$/.test(w.text))
}
