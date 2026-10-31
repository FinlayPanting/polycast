import { describe, expect, it } from 'vitest'
import type { Segment, Word } from '@polycast/core'
import { currentLine, stamp, transcriptLines, TRANSCRIPT_HINT } from './transcript'
import { playerMenu } from './playerMenu'

const words: Word[] = [
  { text: 'Vi', start: 1, end: 1.3 },
  { text: 'tar', start: 1.3, end: 1.6 },
  { text: 'fika.', start: 1.6, end: 2.2 },
  { text: 'Tåget', start: 5, end: 5.4 },
  { text: 'är', start: 5.4, end: 5.6 },
  { text: 'försenat!', start: 5.6, end: 6.3 },
]
const segments: Segment[] = [
  { id: 's0', start: 1, end: 2.2, text: 'Vi tar fika.', translation: 'We have a coffee break.', wordStart: 0, wordEnd: 3 },
  { id: 's1', start: 5, end: 6.3, text: 'Tåget är försenat!', wordStart: 3, wordEnd: 6 },
]
const glossary = { 'försenat': { lemma: 'försenad', meaning: 'late' }, fika: { lemma: 'fika', meaning: 'coffee break' } }

describe('Read the whole episode (PC-1030-03)', () => {
  it('gives every line in the host’s language with the translation under it', () => {
    const lines = transcriptLines(segments, words, { glossary, language: 'sv' })
    expect(lines.map((l) => [l.id, l.text, l.translation])).toEqual([
      ['s0', 'Vi tar fika.', 'We have a coffee break.'],
      ['s1', 'Tåget är försenat!', undefined],
    ])
    expect(lines[0]!.pieces.map((p) => p.text).join(' ')).toBe('Vi tar fika.')
    expect(lines[1]!.pieces.map((p) => p.index)).toEqual([3, 4, 5])
    expect(lines[0]!.label).toBe('0:01. Vi tar fika.. We have a coffee break.')
  })

  it('leaves the translation out in target-only mode', () => {
    expect(transcriptLines(segments, words, { withTranslation: false })[0]!.translation).toBeUndefined()
  })

  it('underlines saved words by their dictionary form, punctuation and case aside', () => {
    const lines = transcriptLines(segments, words, { saved: ['försenad', 'Fika'], glossary, language: 'sv' })
    expect(lines.flatMap((l) => l.pieces.filter((p) => p.saved).map((p) => p.text))).toEqual(['fika.', 'försenat!'])
    expect(transcriptLines(segments, words, { glossary, language: 'sv' }).some((l) => l.pieces.some((p) => p.saved))).toBe(false)
  })

  it('picks out the line being spoken, and in a pause the one just heard', () => {
    expect(currentLine(segments, 0.5)).toBe(-1)
    expect(currentLine(segments, 1.5)).toBe(0)
    expect(currentLine(segments, 3.5)).toBe(0)
    expect(currentLine(segments, 5.2)).toBe(1)
    expect(currentLine(segments, 99)).toBe(1)
    expect(currentLine([], 3)).toBe(-1)
  })

  it('stamps lines with the time they start', () => {
    expect([stamp(7.9), stamp(765), stamp(3723), stamp(-1)]).toEqual(['0:07', '12:45', '1:02:03', '0:00'])
    expect(TRANSCRIPT_HINT).toMatch(/^Tap a line/)
  })

  it('opens from the player’s More menu whenever there is a transcript', () => {
    const m = playerMenu({ hasIntro: false, guideSpeaking: false, hasTranscript: true })
    expect(m.actions[0]).toBe('transcript')
    expect(m.options[0]).toBe('Read the whole episode')
    expect(playerMenu({ hasIntro: false, guideSpeaking: false }).actions).not.toContain('transcript')
  })
})
