import type { Word } from '@polycast/core'
import { errorFromResponse, type Transcriber } from './types'

interface ScribeWord {
  text: string
  start: number
  end: number
  type: 'word' | 'spacing' | 'audio_event'
  speaker_id?: string
}

/** Keeps spoken words only; audio events like "(laughter)" and spacing tokens are dropped. */
export function wordsFromScribe(words: ScribeWord[]): Word[] {
  return words
    .filter((w) => w.type === 'word' && w.text.trim().length > 0)
    .map((w) => ({ text: w.text.trim(), start: w.start, end: w.end, speaker: w.speaker_id }))
}

/**
 * ElevenLabs Scribe v2. Sends the publisher's audio URL (`source_url`), so the episode is
 * fetched by ElevenLabs and never stored by Polycast.
 */
export function scribeTranscriber(apiKey: string, fetchImpl: typeof fetch = fetch): Transcriber {
  return {
    async transcribe({ audioUrl, language, durationSec }) {
      const form = new FormData()
      form.set('model_id', 'scribe_v2')
      form.set('source_url', audioUrl)
      form.set('language_code', language)
      form.set('diarize', 'true')
      form.set('timestamps_granularity', 'word')
      form.set('tag_audio_events', 'false')
      const res = await fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
      })
      if (!res.ok) throw errorFromResponse('ElevenLabs Scribe', res.status, await res.text())
      const json = (await res.json()) as { language_code?: string; words?: ScribeWord[] }
      const words = wordsFromScribe(json.words ?? [])
      const heard = words.at(-1)?.end ?? durationSec
      return { words, detectedLanguage: json.language_code, usage: { transcriptionSec: Math.max(heard, durationSec) } }
    },
  }
}
