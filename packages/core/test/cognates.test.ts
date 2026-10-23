import { describe, expect, it } from 'vitest'
import { cognateSimilarity, knownWords } from '../src/cognates'
import type { Word } from '../src/types'

const say = (text: string): Word[] => text.split(' ').map((t, i) => ({ text: t, start: i, end: i + 0.8 }))

describe('You already know these words (PC-1022-08)', () => {
  it('spots words that look like their meaning, accents and endings aside', () => {
    expect(cognateSimilarity('importante', 'important')).toBeGreaterThan(0.85)
    expect(cognateSimilarity('musik', 'music; songs')).toBeGreaterThanOrEqual(0.8)
    expect(cognateSimilarity('café', 'coffee')).toBeLessThan(0.7)
    expect(cognateSimilarity('famiglia', 'family')).toBeGreaterThanOrEqual(0.7)
    expect(cognateSimilarity('ristorante', 'restaurant')).toBeGreaterThanOrEqual(0.7)
    expect(cognateSimilarity('viktig', 'important')).toBeLessThan(0.3)
    expect(cognateSimilarity('fika', 'coffee break')).toBe(0)
    expect(cognateSimilarity('celebrar', 'to celebrate')).toBeGreaterThan(0.6)
    // Too short to count: "en" / "in".
    expect(cognateSimilarity('in', 'in')).toBe(0)
  })

  it('picks up to five, most alike first, once each, with the host saying them', () => {
    const words = say('Det är viktigt med musik och musik är fantastisk för familjen och telefonen ringer i restaurangen nu idag')
    const glossary = {
      musik: { lemma: 'musik', meaning: 'music' },
      fantastisk: { lemma: 'fantastisk', meaning: 'fantastic' },
      familjen: { lemma: 'familj', meaning: 'family' },
      telefonen: { lemma: 'telefon', meaning: 'phone' },
      restaurangen: { lemma: 'restaurang', meaning: 'restaurant' },
      viktigt: { lemma: 'viktig', meaning: 'important' },
      idag: { lemma: 'idag', meaning: 'today' },
    }
    const known = knownWords(words, glossary, 'sv')
    expect(known.map((k) => k.text)).toEqual(['restaurangen', 'familjen', 'fantastisk', 'musik'])
    expect(known.find((k) => k.text === 'musik')).toEqual({ text: 'musik', meaning: 'music', clip: { start: 3.88, end: 4.92 } })
    expect(knownWords(words, undefined)).toEqual([])
    expect(knownWords(words, glossary, 'sv', 2)).toHaveLength(2)
  })
})
