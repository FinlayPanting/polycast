import type { Word } from '@polycast/core'
import { silentWav } from '../audio'
import type { JsonSchema, SpeechSynth, Storage, TextModel, Transcriber } from './types'

/** Returns fixed words, as if transcribed. */
export function mockTranscriber(words: Word[]): Transcriber & { calls: number } {
  const t = {
    calls: 0,
    async transcribe({ durationSec }: { durationSec: number }) {
      t.calls++
      return { words, usage: { transcriptionSec: durationSec } }
    },
  }
  return t
}

/** Answers each request with whatever `respond` returns for it. */
export function mockText(respond: (req: { system: string; prompt: string; schema: JsonSchema }) => unknown): TextModel & { calls: { prompt: string }[] } {
  const calls: { prompt: string }[] = []
  return {
    calls,
    async generateJson<T>(req: { system: string; prompt: string; schema: JsonSchema }) {
      calls.push({ prompt: req.prompt })
      return { data: respond(req) as T, usage: { textInTokens: Math.ceil(req.prompt.length / 4), textOutTokens: 200 } }
    },
  }
}

/** Speech at 15 characters a second, as silent audio. */
export function mockSpeech(): SpeechSynth & { texts: string[] } {
  const texts: string[] = []
  return {
    texts,
    async synthesize({ text }) {
      texts.push(text)
      const durationSec = Math.max(0.5, text.length / 15)
      return { audio: silentWav(durationSec, 8000), mimeType: 'audio/wav', durationSec, usage: { ttsAudioSec: durationSec } }
    },
  }
}

export function memoryStorage(): Storage & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>()
  return {
    files,
    async put(path, bytes) {
      files.set(path, bytes)
      return `https://storage.test/${path}`
    },
    async exists(path) {
      return files.has(path) ? `https://storage.test/${path}` : undefined
    },
  }
}
