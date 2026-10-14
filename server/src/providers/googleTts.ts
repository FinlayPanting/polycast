import { errorFromResponse, ProviderError, type SpeechSynth } from './types'
import { wavDurationSec } from '../audio'

/** Locales for the guide's voice, by the learner's own language. British English for English. */
const LOCALES: Record<string, string> = {
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-BR',
  sv: 'sv-SE',
}

export function chirpVoiceName(voice: string, language: string): { languageCode: string; name: string } {
  const languageCode = LOCALES[language.slice(0, 2).toLowerCase()] ?? 'en-GB'
  return { languageCode, name: `${languageCode}-Chirp3-HD-${voice}` }
}

/**
 * Google Cloud Text-to-Speech with Chirp 3 HD voices, which share their names (Sulafat, Achird…)
 * with Gemini's voices. Billed per character, with project limits per minute rather than per day.
 * Returns WAV (LINEAR16), encoded to AAC like the other voice.
 */
/** The guide's own-language pace (was 0.95; Finlay found it rushed, 14 Oct 2026). */
export const GUIDE_SPEAKING_RATE = 0.9
/** Target-language words and examples: slow and clear, so a learner catches every sound. */
export const TARGET_SPEAKING_RATE = 0.8

export function googleChirpSpeech(
  apiKey: string,
  encode: (wav: Uint8Array) => Promise<{ audio: Uint8Array; mimeType: string }>,
  opts: { speakingRate?: number; fetchImpl?: typeof fetch } = {},
): SpeechSynth {
  const fetchImpl = opts.fetchImpl ?? fetch
  return {
    async synthesize({ text, voice, language, rate }) {
      const res = await fetchImpl('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: chirpVoiceName(voice, language),
          // Slower than default: the guide is talking to a learner who was half-listening.
          audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: rate ?? opts.speakingRate ?? GUIDE_SPEAKING_RATE },
        }),
      })
      if (!res.ok) throw errorFromResponse('Google TTS', res.status, await res.text())
      const { audioContent } = (await res.json()) as { audioContent?: string }
      if (!audioContent) throw new ProviderError('Google TTS reply had no audio', true)
      const wav = Uint8Array.from(Buffer.from(audioContent, 'base64'))
      const durationSec = wavDurationSec(wav)
      const { audio, mimeType } = await encode(wav)
      return { audio, mimeType, durationSec, usage: { ttsChars: text.length } }
    },
  }
}
