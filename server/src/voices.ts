/**
 * The guides (spec: The guide). Each has its own first name and a Gemini voice. The voice choices are
 * starting points for Finlay to audition; change the voice here and re-voice affected episodes.
 */
export interface Guide {
  id: string
  name: string
  /** Voice name shared by Gemini TTS and Google Cloud Chirp 3 HD (e.g. Sulafat, Achird). */
  voice: string
  /**
   * The guide's ElevenLabs voice (Eleven v4 Turbo), the default since 17 Oct 2026. Finlay's blind
   * casting: Bella for Mia, Charlie for Leo. One voice per guide for every language for now.
   */
  elevenLabsVoiceId: string
  style: string
}

const STYLE = 'a warm, unhurried language guide speaking to an adult learner; friendly, clear, never over-excited'

export const GUIDES: Guide[] = [
  { id: 'mia', name: 'Mia', voice: 'Sulafat', elevenLabsVoiceId: 'hpp4J3VqNfWAUOO0d1Us', style: STYLE },
  { id: 'leo', name: 'Leo', voice: 'Achird', elevenLabsVoiceId: 'IKne3meq5aSn9XLyUdCD', style: STYLE },
]

export const DEFAULT_GUIDE = GUIDES[0]!

export function guideById(id: string | undefined): Guide {
  return GUIDES.find((g) => g.id === id) ?? DEFAULT_GUIDE
}

/** The ElevenLabs voice for a guide's voice setting (an id passes through unchanged). */
export function elevenVoiceFor(voice: string): string {
  return GUIDES.find((g) => g.voice === voice || g.elevenLabsVoiceId === voice)?.elevenLabsVoiceId ?? voice
}
