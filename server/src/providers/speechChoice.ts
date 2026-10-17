import { ProviderError, type SpeechSynth } from './types'

export type TtsProvider = 'elevenlabs' | 'chirp' | 'gemini'

/**
 * Which voice the guide uses (TTS_PROVIDER). ElevenLabs Eleven v4 Turbo is the default since 17 Oct
 * 2026 (PC-1017-09), so Railway needs no change; `chirp` switches back to Google's Chirp 3 HD, and
 * `gemini` to Gemini TTS. Anything else, or a choice whose key is missing, falls back to ElevenLabs, then Chirp, then Gemini, by which keys are set.
 */
export function chooseTtsProvider(env: { TTS_PROVIDER?: string; ELEVENLABS_API_KEY?: string; GOOGLE_TTS_API_KEY?: string }): TtsProvider {
  const wanted = (env.TTS_PROVIDER ?? 'elevenlabs').trim().toLowerCase()
  if (wanted === 'gemini') return 'gemini'
  if (wanted === 'chirp' && env.GOOGLE_TTS_API_KEY) return 'chirp'
  if (env.ELEVENLABS_API_KEY) return 'elevenlabs'
  if (env.GOOGLE_TTS_API_KEY) return 'chirp'
  return 'gemini'
}

/**
 * The chosen voice, with a fallback for a call it refuses outright (a 4xx that retrying won't fix,
 * say a voice missing from the account): that line is read by the fallback instead, and Finlay is
 * told once, so an episode still gets prepared. Retryable errors (429, 5xx) go back to the caller,
 * which retries the same voice.
 */
export function withFallbackSpeech(primary: SpeechSynth, fallback: SpeechSynth | undefined, onFallback?: (message: string) => void): SpeechSynth {
  if (!fallback) return primary
  let told = false
  return {
    mixedLanguage: primary.mixedLanguage,
    async synthesize(input) {
      try {
        return await primary.synthesize(input)
      } catch (e) {
        if (!(e instanceof ProviderError) || e.retryable) throw e
        if (!told) {
          told = true
          onFallback?.(e.message)
        }
        return fallback.synthesize(input)
      }
    },
  }
}
