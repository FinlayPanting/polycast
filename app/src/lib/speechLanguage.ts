/**
 * The language VoiceOver should read a label in (PC-1024-04). React Native's `accessibilityLanguage`
 * takes a BCP 47 tag; without it, iOS reads Spanish or Swedish lines in the phone's English voice.
 * Learner languages use the bare code, so iOS picks that language's default voice; meanings and
 * translations are British English, like the rest of the app.
 */
import { LAUNCH_LANGUAGES } from '@polycast/core'

export const ENGLISH_SPEECH = 'en-GB'

export function speechLanguage(code: string | null | undefined): string | undefined {
  if (!code) return undefined
  const base = code.toLowerCase().split(/[-_]/)[0]!
  return (LAUNCH_LANGUAGES as readonly string[]).includes(base) ? base : undefined
}
