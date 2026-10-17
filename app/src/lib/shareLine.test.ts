import type { Segment } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { shareableLines, shareMessage, SHARE_URL } from './shareLine'

const seg = (id: string, start: number, end: number, text: string, translation?: string): Segment => ({ id, start, end, text, translation, wordStart: 0, wordEnd: 0 })

const segments = [
  seg('a', 0, 4, 'Hej och välkommen till programmet.', 'Hi and welcome to the show.'),
  seg('b', 4, 6, 'Ja.', 'Yes.'),
  seg('c', 6, 10, 'Vi pratar om fika i dag, helt enkelt.'),
  seg('d', 10, 15, 'Det är det bästa med hela veckan, faktiskt.', 'It is the best thing about the whole week, actually.'),
  seg('e', 15, 20, 'Och sedan går vi hem.', 'And then we go home.'),
]

describe('lines to share from a listen', () => {
  it('picks the lines around caught words, in episode order, once each', () => {
    const lines = shareableLines(segments, [12, 1, 11, 2])
    expect(lines.map((l) => l.text)).toEqual(['Hej och välkommen till programmet.', 'Det är det bästa med hela veckan, faktiskt.'])
    expect(lines[1]).toEqual({ text: 'Det är det bästa med hela veckan, faktiskt.', translation: 'It is the best thing about the whole week, actually.', start: 10 })
  })
  it('skips fragments and lines without a translation', () => {
    expect(shareableLines(segments, [5, 8])).toEqual([])
  })
  it('stops at the limit', () => {
    expect(shareableLines(segments, [1, 12, 16], 2)).toHaveLength(2)
  })
  it('offers nothing when nothing was caught', () => {
    expect(shareableLines(segments, [])).toEqual([])
  })
})

describe('the shared message', () => {
  it('quotes the line, gives its meaning and credits the show', () => {
    const msg = shareMessage({ text: 'Hej och välkommen.', translation: 'Hi and welcome.', start: 0 }, 'Gemischtes Hack')
    expect(msg).toBe(`“Hej och välkommen.”\nHi and welcome.\n\nCaught on Polycast, from Gemischtes Hack.\n${SHARE_URL}`)
  })
})
