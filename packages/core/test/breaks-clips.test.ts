import { describe, expect, it } from 'vitest'
import { findBreaks, findOccurrences, sentenceClip, snapToBreak, wordClip } from '../src'
import { wordsFrom } from './fixtures'

describe('natural breaks', () => {
  const words = wordsFrom('Vi missade tåget. Det var försenad igen och vi väntade länge', 0, { 2: 0.4, 7: 1.2 })

  it('finds sentence ends with a short pause and long pauses mid-sentence', () => {
    const breaks = findBreaks(words)
    expect(breaks.map((b) => b.afterWord)).toEqual([2, 7, words.length - 1])
    expect(breaks[0]!.sentenceEnd).toBe(true)
    expect(breaks[1]!.sentenceEnd).toBe(false)
  })

  it('never breaks on a sentence end that has no pause', () => {
    const tight = wordsFrom('Hej. Hej. Hej.')
    expect(findBreaks(tight).map((b) => b.afterWord)).toEqual([2])
  })

  it('snaps a moment to the nearest break before or after a time', () => {
    const breaks = findBreaks(words)
    expect(snapToBreak(2.2, breaks, 'before')?.afterWord).toBe(2)
    expect(snapToBreak(0.5, breaks, 'after')?.afterWord).toBe(2)
    expect(snapToBreak(0.1, breaks, 'before')).toBeUndefined()
  })

  it('takes a nearby mid-sentence pause when the next sentence end is far away', () => {
    const long = wordsFrom(`och sen ${'vi pratade länge om allt '.repeat(6)}slut.`, 0, { 1: 1.0 })
    expect(snapToBreak(0.2, findBreaks(long), 'after')?.afterWord).toBe(1)
  })

  it('waits a few seconds longer to land on a sentence end', () => {
    // Mid-sentence pause after word 1; sentence end after word 4, about two seconds later.
    const w = wordsFrom('Jag tänkte att vi går. Sen gick vi hem nu och sen', 0, { 1: 1.0, 4: 0.5 })
    expect(snapToBreak(0.5, findBreaks(w), 'after')?.afterWord).toBe(4)
  })

  it('marks speaker changes', () => {
    const a = wordsFrom('Hej då.', 0, { 1: 0.5 }, 'A')
    const b = wordsFrom('Ses snart.', a.at(-1)!.end + 0.6, {}, 'B')
    const breaks = findBreaks([...a, ...b])
    expect(breaks[0]!.speakerChange).toBe(true)
  })
})

describe('host clips', () => {
  const words = wordsFrom('Tåget var Försenad, som vanligt. Väldigt försenad faktiskt')

  it('finds every occurrence regardless of case and punctuation', () => {
    const occ = findOccurrences(words, 'försenad', 'sv')
    expect(occ.map((o) => o.first)).toEqual([2, 6])
  })

  it('finds multi-word phrases', () => {
    expect(findOccurrences(words, 'som vanligt', 'sv')).toHaveLength(1)
  })

  it('pads a word clip without reaching into neighbouring words', () => {
    const [occ] = findOccurrences(words, 'försenad', 'sv')
    const clip = wordClip(words, occ!)
    expect(clip.start).toBeGreaterThanOrEqual(words[1]!.end)
    expect(clip.end).toBeLessThanOrEqual(words[3]!.start)
    expect(clip.start).toBeLessThan(words[2]!.start)
  })

  it('returns the subtitle line a word sits in', () => {
    const segments = [
      { id: 's1', start: 0, end: 1.7, text: 'Tåget var Försenad, som vanligt.', wordStart: 0, wordEnd: 5 },
      { id: 's2', start: 1.75, end: 2.8, text: 'Väldigt försenad faktiskt', wordStart: 5, wordEnd: 8 },
    ]
    expect(sentenceClip(segments, 6)).toEqual({ start: 1.65, end: 2.9 })
    expect(sentenceClip(segments, 99)).toBeUndefined()
  })
})
