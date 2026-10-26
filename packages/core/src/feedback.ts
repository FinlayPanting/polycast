/**
 * 'Tell Finlay' (PC-1025-05): a short note from You, optionally with a screenshot of the screen the
 * learner was just on, the app version and their language. Kept on the server for 90 days.
 */
export const FEEDBACK_LIMITS = {
  /** Characters in the note. */
  message: 2000,
  /** Bytes in the screenshot, once decoded (a phone screen as a JPEG at 60% is well under this). */
  screenshotBytes: 1_500_000,
  /** Notes per learner per hour. */
  perHour: 5,
  /** Days a note is kept. */
  keepDays: 90,
} as const

export interface FeedbackNote {
  message: string
  /** Which screen the learner was on, e.g. 'Show page'. */
  screen: string | null
  appVersion: string | null
  language: string | null
  /** JPEG or PNG bytes. */
  screenshot: Uint8Array | null
}

export type FeedbackCheck = { ok: true; note: FeedbackNote } | { ok: false; error: string }

const short = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

function decodeBase64(s: string): Uint8Array | null {
  const clean = s.replace(/^data:image\/(jpeg|png);base64,/, '').replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) return null
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Whether these bytes start like a JPEG or a PNG. */
export function isScreenshotImage(b: Uint8Array): boolean {
  const jpeg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  const png = b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  return jpeg || png
}

/** Checks a note as the app sends it: `{ message, screen?, appVersion?, language?, screenshot? (base64) }`. */
export function checkFeedback(body: any): FeedbackCheck {
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return { ok: false, error: 'Write a few words first.' }
  if (message.length > FEEDBACK_LIMITS.message) return { ok: false, error: `Please keep it under ${FEEDBACK_LIMITS.message} characters.` }
  let screenshot: Uint8Array | null = null
  if (body?.screenshot !== undefined && body?.screenshot !== null) {
    const raw = typeof body.screenshot === 'string' && body.screenshot.length <= Math.ceil(FEEDBACK_LIMITS.screenshotBytes / 3) * 4 + 64 ? decodeBase64(body.screenshot) : null
    if (!raw || raw.length > FEEDBACK_LIMITS.screenshotBytes || !isScreenshotImage(raw)) return { ok: false, error: 'That screenshot couldn’t be sent. Try again without it.' }
    screenshot = raw
  }
  const language = short(body?.language, 8)
  return {
    ok: true,
    note: {
      message,
      screen: short(body?.screen, 60),
      appVersion: short(body?.appVersion, 32),
      language: language && /^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(language) ? language : null,
      screenshot,
    },
  }
}

const SCREEN_NAMES: Record<string, string> = {
  index: 'Discover',
  library: 'Library',
  words: 'Words',
  you: 'You',
  search: 'Search',
  show: 'Show page',
  episode: 'Episode page',
  listen: 'Player',
  review: 'Word review',
  plus: 'Plus',
  tip: 'Tip',
  keys: 'Your own API keys',
  'whats-new': 'What’s new',
}

/** A plain name for the screen at these router segments, e.g. ['(tabs)', 'library'] → 'Library'. */
export function screenName(segments: readonly string[]): string {
  const first = segments[0] === '(tabs)' ? (segments[1] ?? 'index') : segments[0]
  return (first && SCREEN_NAMES[first]) || 'Another screen'
}
