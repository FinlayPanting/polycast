import { describe, expect, it } from 'vitest'
import { applyEditedSpellings, costUSD, estimatePrepCostUSD, recurringNames, SCRIBE_INSTRUCTION_MAX, scribeNameInstruction, ZERO_USAGE, type Word } from '../src'

const timed = (text: string): Word[] => text.split(' ').map((t, i) => ({ text: t, start: i, end: i + 0.8 }))

describe('scribeNameInstruction', () => {
  it('names the show and hosts, and asks for spelling fixes only', () => {
    const s = scribeNameInstruction({ showTitle: 'Alex & Sigges podcast', hosts: ['Alex Schulman', 'Sigge Eklund'], names: ['Göteborg', 'Sigge Eklund'] })!
    expect(s).toContain('"Alex & Sigges podcast"')
    expect(s).toContain('hosted by Alex Schulman, Sigge Eklund.')
    expect(s).toContain(': Alex & Sigges podcast, Alex Schulman, Sigge Eklund, Göteborg.')
    expect(s.match(/Sigge Eklund/g)).toHaveLength(2) // once as host, once in the list; not repeated from names
    expect(s).toMatch(/Change nothing else/)
  })

  it('stays within Scribe’s 2,000 characters however many names a feed has', () => {
    const names = Array.from({ length: 400 }, (_, i) => `Gästnamn${i}`)
    const s = scribeNameInstruction({ showTitle: 'Svenska Samtal', hosts: ['Anna'], names })!
    expect(s.length).toBeLessThanOrEqual(SCRIBE_INSTRUCTION_MAX)
    expect(s).toMatch(/Change nothing else/)
  })

  it('says nothing when there is nothing to say', () => {
    expect(scribeNameInstruction({ showTitle: ' ', hosts: [], names: [] })).toBeUndefined()
  })
})

describe('recurringNames', () => {
  it('keeps capitalised words found in two or more titles, ignoring each title’s first word', () => {
    const titles = ['Fika med Lotta i Malmö', 'Ute med Lotta och Erik i Malmö', 'Erik om hösten', 'Hösten är här']
    expect(recurringNames(titles)).toEqual(['Lotta', 'Malmö'])
  })
})

describe('applyEditedSpellings', () => {
  it('takes corrected names and keeps every original timing', () => {
    const words = timed('Hej, jag heter Siggi Ecklund och det här är Alex.')
    const { words: out, changed } = applyEditedSpellings(words, 'Hej, jag heter Sigge Eklund och det här är Alex.', 'sv')
    expect(out.map((w) => w.text).join(' ')).toBe('Hej, jag heter Sigge Eklund och det här är Alex.')
    expect(changed).toBe(2)
    expect(out.map((w) => [w.start, w.end])).toEqual(words.map((w) => [w.start, w.end]))
  })

  it('keeps the original where the edit added, dropped, merged or rewrote words', () => {
    const words = timed('vi åkte till Göteborg i går och sen hem')
    const edited = 'vi reste till Gothenburg igår och sedan hem'
    const { words: out } = applyEditedSpellings(words, edited, 'sv')
    // "åkte" → "reste" isn't a spelling; "i går" → "igår" is a merge; "sen" → "sedan" too far apart.
    expect(out.map((w) => w.text).join(' ')).toBe('vi åkte till Göteborg i går och sen hem')
    expect(out).toHaveLength(words.length)
  })

  it('keeps the original word’s punctuation', () => {
    const { words: out } = applyEditedSpellings(timed('Tack, Lote!'), 'Tack Lotte', 'sv')
    expect(out.map((w) => w.text)).toEqual(['Tack,', 'Lotte!'])
  })

  it('copes with an empty or unrelated edit', () => {
    const words = timed('en två tre')
    expect(applyEditedSpellings(words, '', 'sv').words.map((w) => w.text)).toEqual(['en', 'två', 'tre'])
    expect(applyEditedSpellings(words, 'something else entirely here', 'sv').changed).toBe(0)
  })
})

describe('name-spelling cost', () => {
  it('adds 30% of transcription to the estimate, and nothing when the feed has a transcript', () => {
    expect(costUSD({ ...ZERO_USAGE, transcriptEditSec: 3600 })).toBeCloseTo(0.066, 4)
    expect(estimatePrepCostUSD(3600) - estimatePrepCostUSD(3600, { feedTranscript: true })).toBeCloseTo(0.22 + 0.066, 4)
  })
})
