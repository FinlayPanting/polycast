import type { Usage, Word } from '@polycast/core'

/** Turns episode audio into timed words. The audio streams from the publisher; Polycast never stores it. */
export interface Transcriber {
  transcribe(input: { audioUrl: string; language: string; durationSec: number }): Promise<{
    words: Word[]
    detectedLanguage?: string
    usage: Partial<Usage>
  }>
}

/** A JSON Schema object describing the model's reply. */
export type JsonSchema = Record<string, unknown>

/** Writes structured text: translations and lesson plans. */
export interface TextModel {
  generateJson<T>(input: { system: string; prompt: string; schema: JsonSchema; temperature?: number }): Promise<{
    data: T
    usage: Partial<Usage>
  }>
}

/** The guide's voice. Returns encoded audio ready to store. */
export interface SpeechSynth {
  synthesize(input: { text: string; voice: string; style: string; language: string }): Promise<{
    audio: Uint8Array
    mimeType: string
    durationSec: number
    usage: Partial<Usage>
  }>
}

/** File storage for guide audio. Returns a URL the app can stream. */
export interface Storage {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<string>
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

/**
 * 429s and 5xx are worth retrying; other 4xx mean the request itself is wrong. A daily quota
 * ("100 requests per day") isn't: waiting minutes won't help, so fail at once and say so.
 */
export function errorFromResponse(provider: string, status: number, body: string): ProviderError {
  const dailyQuota = status === 429 && /per day|daily/i.test(body)
  const retryable = !dailyQuota && (status === 429 || status >= 500)
  return new ProviderError(`${provider} returned ${status}: ${body.slice(0, 300)}`, retryable, status)
}
