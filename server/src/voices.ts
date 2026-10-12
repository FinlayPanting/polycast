/**
 * The guides (spec: The guide). Each has its own first name and a Gemini voice. The voice choices are
 * starting points for Finlay to audition; change the voice here and re-voice affected episodes.
 */
export interface Guide {
  id: string
  name: string
  /** Gemini prebuilt voice name. */
  voice: string
  style: string
}

const STYLE = 'a warm, unhurried language guide speaking to an adult learner; friendly, clear, never over-excited'

export const GUIDES: Guide[] = [
  { id: 'mia', name: 'Mia', voice: 'Sulafat', style: STYLE },
  { id: 'leo', name: 'Leo', voice: 'Achird', style: STYLE },
]

export const DEFAULT_GUIDE = GUIDES[0]!

export function guideById(id: string | undefined): Guide {
  return GUIDES.find((g) => g.id === id) ?? DEFAULT_GUIDE
}
