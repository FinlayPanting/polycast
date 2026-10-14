import { applyEditedSpellings, scribeNameInstruction, type Word } from '@polycast/core'
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
 * ElevenLabs Scribe v2. Given the episode's bytes (downloaded once by the worker, which also
 * fingerprints them), it uploads those, so the transcript's timings match the fingerprint exactly.
 * Otherwise it sends the publisher's URL (`source_url`) and ElevenLabs fetches its own copy.
 * Either way Polycast never stores the episode.
 */
export function scribeTranscriber(apiKey: string, fetchImpl: typeof fetch = fetch): Transcriber {
  return {
    async transcribe({ audioUrl, language, durationSec, audio, names }) {
      const instruction = names ? scribeNameInstruction(names) : undefined
      const form = new FormData()
      form.set('model_id', 'scribe_v2')
      if (audio) form.set('file', new Blob([audio as BlobPart], { type: 'audio/mpeg' }), 'episode.mp3')
      else form.set('source_url', audioUrl)
      form.set('language_code', language)
      form.set('diarize', 'true')
      form.set('timestamps_granularity', 'word')
      form.set('tag_audio_events', 'false')
      // Scribe applies this after transcribing and returns `edited_transcript` beside the original.
      if (instruction) form.set('transcript_edit', instruction)
      const res = await fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
      })
      if (!res.ok) throw errorFromResponse('ElevenLabs Scribe', res.status, await res.text())
      const json = (await res.json()) as {
        language_code?: string
        words?: ScribeWord[]
        edited_transcript?: { kind: 'transcript'; text: string } | { kind: 'error'; message?: string }
      }
      const original = wordsFromScribe(json.words ?? [])
      // The timings describe the original words, so the edit only lends its spelling of names
      // to words it swaps one for one. A failed edit leaves the original transcript as it was.
      const edit = json.edited_transcript
      const words = edit?.kind === 'transcript' ? applyEditedSpellings(original, edit.text, language).words : original
      const heardSec = Math.max(original.at(-1)?.end ?? durationSec, durationSec)
      return {
        words,
        detectedLanguage: json.language_code,
        usage: { transcriptionSec: heardSec, ...(instruction ? { transcriptEditSec: Math.max(10, heardSec) } : {}) },
      }
    },
  }
}
