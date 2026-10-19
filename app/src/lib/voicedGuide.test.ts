import { describe, expect, it } from 'vitest'
import { guideName, voicedGuideId } from './languages'

describe("the guide's name matches the voice you hear", () => {
  it('names the guide the lesson was recorded with, not the current setting', () => {
    expect(guideName(voicedGuideId('mia', 'leo'))).toBe('Mia')
    expect(guideName(voicedGuideId('leo', 'mia'))).toBe('Leo')
  })

  it('falls back to the setting for lessons saved before the voice was recorded with them', () => {
    expect(voicedGuideId(undefined, 'leo')).toBe('leo')
    expect(voicedGuideId(null, 'leo')).toBe('leo')
    expect(voicedGuideId('someone-new', undefined)).toBe('mia')
  })
})
