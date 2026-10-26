import { describe, expect, it } from 'vitest'
import { feedbackBody, freshShot, SHOT_FRESH_MS, shouldPicture } from './lastScreenCore'

const shot = { base64: '/9j/AAA', screen: 'Show page', at: 1000 }

describe("'Tell Finlay' screenshot (PC-1025-05)", () => {
  it('offers the picture for ten minutes', () => {
    expect(freshShot(shot, 1000 + SHOT_FRESH_MS - 1)).toBe(shot)
    expect(freshShot(shot, 1000 + SHOT_FRESH_MS)).toBeNull()
    expect(freshShot(null, 0)).toBeNull()
  })

  it('pictures the screen only when heading into You from somewhere else', () => {
    expect(shouldPicture('you', 'library', true)).toBe(true)
    expect(shouldPicture('you', 'you', false)).toBe(true) // a show page opened from You
    expect(shouldPicture('you', 'you', true)).toBe(false)
    expect(shouldPicture('words', 'library', true)).toBe(false)
  })

  it('sends the screenshot only when the learner chose to', () => {
    expect(feedbackBody({ message: ' Lost my place ', shot, attach: true, appVersion: '1.0.0', language: 'sv' })).toEqual({
      message: 'Lost my place', screen: 'Show page', screenshot: '/9j/AAA', appVersion: '1.0.0', language: 'sv',
    })
    expect(feedbackBody({ message: 'hi', shot, attach: false })).toEqual({ message: 'hi', screen: 'Show page' })
    expect(feedbackBody({ message: 'hi', shot: null, attach: true })).toEqual({ message: 'hi' })
  })
})
