import { describe, expect, it } from 'vitest'
import { checkFeedback, FEEDBACK_LIMITS, isScreenshotImage, screenName } from '../src'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]).toString('base64')

describe("'Tell Finlay' notes (PC-1025-05)", () => {
  it('takes a note with its screen, version, language and screenshot', () => {
    const r = checkFeedback({ message: '  The play button hid behind the bar ', screen: 'Show page', appVersion: '1.0.0', language: 'sv', screenshot: jpeg })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.note).toMatchObject({ message: 'The play button hid behind the bar', screen: 'Show page', appVersion: '1.0.0', language: 'sv' })
    expect(Array.from(r.note.screenshot!.slice(0, 3))).toEqual([0xff, 0xd8, 0xff])
    expect((checkFeedback({ message: 'ok', screenshot: `data:image/png;base64,${png}` }) as any).note.screenshot).toHaveLength(9)
  })

  it('needs a message, kept to a sensible length', () => {
    expect(checkFeedback({ message: '   ' })).toEqual({ ok: false, error: 'Write a few words first.' })
    expect(checkFeedback({})).toMatchObject({ ok: false })
    expect(checkFeedback({ message: 'x'.repeat(FEEDBACK_LIMITS.message + 1) })).toMatchObject({ ok: false })
    expect(checkFeedback({ message: 'x'.repeat(FEEDBACK_LIMITS.message) }).ok).toBe(true)
  })

  it('refuses a screenshot that is not a picture, or too big', () => {
    expect(checkFeedback({ message: 'hi', screenshot: Buffer.from('<script>').toString('base64') })).toMatchObject({ ok: false })
    expect(checkFeedback({ message: 'hi', screenshot: 'not base64!' })).toMatchObject({ ok: false })
    expect(checkFeedback({ message: 'hi', screenshot: 42 })).toMatchObject({ ok: false })
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(FEEDBACK_LIMITS.screenshotBytes)]).toString('base64')
    expect(checkFeedback({ message: 'hi', screenshot: huge })).toMatchObject({ ok: false })
    expect(isScreenshotImage(new Uint8Array([0xff, 0xd8]))).toBe(false)
  })

  it('drops odd extras rather than refusing the note', () => {
    const r = checkFeedback({ message: 'hi', language: 'Swedish!!', screen: 'x'.repeat(200), appVersion: 7 })
    expect(r).toMatchObject({ ok: true, note: { language: null, appVersion: null, screenshot: null } })
    expect((r as any).note.screen).toHaveLength(60)
  })

  it('names the screen the learner was on', () => {
    expect(screenName(['(tabs)', 'library'])).toBe('Library')
    expect(screenName(['(tabs)'])).toBe('Discover')
    expect(screenName(['episode', '[id]'])).toBe('Episode page')
    expect(screenName(['listen', '[id]'])).toBe('Player')
    expect(screenName(['somewhere-new'])).toBe('Another screen')
  })
})
