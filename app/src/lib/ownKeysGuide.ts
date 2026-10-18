import { ownKeysCostUSD } from '@polycast/core'

/**
 * Copy for "Use your own API keys" (PC-1017-K2): what each key is for, roughly what an hour costs,
 * and how to get each one. Checked against ElevenLabs' and Google AI Studio's pages on 18 Oct 2026;
 * their dashboards change, so check again before each release.
 */
export interface KeyGuide {
  provider: 'elevenlabs' | 'gemini'
  name: string
  usedFor: string
  /** Roughly what an hour of episode costs on this account, in dollars, as the providers bill. */
  hourUSD: number
  link: { label: string; url: string }
  steps: string[]
  /** Said plainly before they start, and again as a hint by the field. */
  heads?: string
}

export function keyGuides(at: Date = new Date()): KeyGuide[] {
  const hour = ownKeysCostUSD(3600, at)
  return [
    {
      provider: 'elevenlabs',
      name: 'ElevenLabs',
      usedFor: 'Hearing the podcast (turning it into subtitles) and Mia’s and Leo’s voices.',
      hourUSD: hour.elevenlabs,
      link: { label: 'Open ElevenLabs API keys', url: 'https://elevenlabs.io/app/settings/api-keys' },
      steps: [
        'Sign in or create an account at elevenlabs.io. Pay-as-you-go credit or any paid plan works.',
        'Open Settings, then API Keys (the button below goes straight there).',
        'Tap Create API key and give it a name, such as Polycast.',
        'If it asks which features the key may use, allow Speech to Text and Text to Speech.',
        'You can set a credit limit on the key, so it never spends more than you want.',
        'Copy the key, come back here and paste it below.',
      ],
    },
    {
      provider: 'gemini',
      name: 'Google',
      usedFor: 'Writing your lessons: the subtitles’ translations, the guide’s script and the primer.',
      hourUSD: hour.google,
      link: { label: 'Open Google AI Studio', url: 'https://aistudio.google.com/app/apikey' },
      heads:
        'A free Google key works, but it’s limited to a few requests a minute, so preparing an episode can take noticeably longer. Adding billing to your Google account (pay as you go, a few cents an episode) removes the wait.',
      steps: [
        'Open Google AI Studio (aistudio.google.com) and sign in with your Google account.',
        'The first time, accept the terms.',
        'Tap Get API key, then Create API key. Creating it in a new project is fine.',
        'Copy the key (it starts with AIza), come back here and paste it below.',
        'Optional: to skip the free key’s wait, set up billing for that project in Google AI Studio.',
      ],
    },
  ]
}

/** "about $0.83" */
export function aboutDollars(usd: number): string {
  return `about $${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)}`
}
