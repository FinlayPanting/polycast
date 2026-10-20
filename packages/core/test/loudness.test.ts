import { describe, expect, it } from 'vitest'
import { GUIDE_LUFS, guideVolume, MIN_GUIDE_VOLUME, parseIntegratedLoudness } from '../src/loudness'

const LOG = `[Parsed_ebur128_0 @ 0x1] t: 2.9 TARGET:-23 LUFS M: -21.8 S: -22.0 I: -22.5 LUFS
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -21.8 LUFS
    Threshold: -31.8 LUFS

  Loudness range:
    LRA:        20.0 LU`

describe('measuring an episode', () => {
  it("reads the integrated loudness from ffmpeg's summary, not a running frame", () => {
    expect(parseIntegratedLoudness(LOG)).toBe(-21.8)
  })
  it('gives nothing for silence or an unreadable log', () => {
    expect(parseIntegratedLoudness('Summary:\n I: -70.0 LUFS')).toBeUndefined()
    expect(parseIntegratedLoudness('no loudness here')).toBeUndefined()
  })
})

describe("the guide's volume", () => {
  it('plays at full volume over a show at or above the standard', () => {
    expect(guideVolume(GUIDE_LUFS)).toBe(1)
    expect(guideVolume(-12)).toBe(1)
  })
  it('turns down to match a quietly recorded show', () => {
    expect(guideVolume(-22)).toBeCloseTo(0.5, 1) // 6 dB quieter: about half
    expect(guideVolume(-26)).toBeCloseTo(0.316, 2)
  })
  it('never goes silent, and plays as before when the episode was never measured', () => {
    expect(guideVolume(-55)).toBe(MIN_GUIDE_VOLUME)
    expect(guideVolume(undefined)).toBe(1)
    expect(guideVolume(NaN)).toBe(1)
  })
})
