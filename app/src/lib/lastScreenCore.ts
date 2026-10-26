/**
 * 'Tell Finlay' (PC-1025-05): a picture of the screen the learner was on just before they opened You,
 * held in memory only (never saved to the phone or sent unless they choose to attach it).
 */
export interface ScreenShot {
  /** JPEG, base64. */
  base64: string
  /** Plain name of the screen, e.g. 'Show page'. */
  screen: string
  at: number
}

/** How long a picture stays offered: long enough to find the row in You, short enough to still be "just now". */
export const SHOT_FRESH_MS = 10 * 60_000

export function freshShot(shot: ScreenShot | null, now: number): ScreenShot | null {
  return shot && now - shot.at >= 0 && now - shot.at < SHOT_FRESH_MS ? shot : null
}

/** Whether going to this tab should first picture the screen being left: only when heading into You from elsewhere. */
export function shouldPicture(tab: string, current: string, onTabRoot: boolean): boolean {
  return tab === 'you' && (current !== 'you' || !onTabRoot)
}

/** The body the server's POST /v1/feedback takes. */
export function feedbackBody(input: { message: string; shot: ScreenShot | null; attach: boolean; appVersion?: string | null; language?: string | null }) {
  return {
    message: input.message.trim(),
    ...(input.attach && input.shot ? { screen: input.shot.screen, screenshot: input.shot.base64 } : input.shot ? { screen: input.shot.screen } : {}),
    ...(input.appVersion ? { appVersion: input.appVersion } : {}),
    ...(input.language ? { language: input.language } : {}),
  }
}
