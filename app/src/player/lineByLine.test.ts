import { describe, expect, it } from 'vitest'
import type { Segment } from '@polycast/core'
import { LINE_END_EARLY_SEC, lineJustEnded } from './lineByLine'

const seg = (id: string, start: number, end: number): Segment => ({ id, start, end, text: id, wordStart: 0, wordEnd: 1 })
const lines = [seg('a', 0, 3), seg('b', 3.2, 3.6), seg('c', 3.7, 7), seg('d', 7.4, 10)]

describe('Line by line (PC-1018-07)', () => {
  it("pauses as playback reaches a line's end, and picks up at the next line's start", () => {
    expect(lineJustEnded(lines, 2.7, 2.95)).toEqual({ line: lines[0], nextStart: 3.2 })
    expect(lineJustEnded(lines, 6.8, 7.05)).toEqual({ line: lines[2], nextStart: 7.4 })
  })

  it('does nothing in the middle of a line, after a seek, or when playback goes backwards', () => {
    expect(lineJustEnded(lines, 1, 1.25)).toBeUndefined()
    expect(lineJustEnded(lines, 0.5, 6.95)).toBeUndefined() // a jump
    expect(lineJustEnded(lines, 2.95, 2.7)).toBeUndefined()
  })

  it("lets a very short line run into the next one, and stops after the last", () => {
    expect(lineJustEnded(lines, 3.3, 3.55)).toBeUndefined() // "b" is under 0.6 s
    expect(lineJustEnded(lines, 9.7, 10 - LINE_END_EARLY_SEC + 0.01)).toEqual({ line: lines[3], nextStart: 10 })
  })
})
