import { describe, expect, it } from 'vitest'
import type { GuideMoment, LessonPlan, Segment } from '@polycast/core'
import { bottomOf } from './shareCard'
import { didYouKnow, enoughWords, guideSignOff, recapLayout, recapWords, statChips, STORY, wordCardLayout, wordOfTheEpisode } from './recap'

const moment = (id: string, kind: GuideMoment['kind'], extra: Partial<GuideMoment> = {}): GuideMoment => ({ id, kind, at: 10, minLevel: 'standard', script: '', clips: [], ...extra })
const term = (lemma: string, meaning: string, text = lemma) => ({ lemma, text, meaning })

const plan = (moments: GuideMoment[], extra: Partial<LessonPlan> = {}): LessonPlan => ({
  episodeId: 'ep1',
  version: 1,
  targetLanguage: 'sv',
  nativeLanguage: 'en',
  hosts: [],
  summary: '',
  moments,
  wrapUpQuestions: [],
  ...extra,
})

const lesson = plan(
  [
    moment('s1', 'spotlight', { term: term('försenad', 'delayed') }),
    moment('s2', 'spotlight', { term: term('fika', 'coffee break') }),
    moment('c1', 'cultureNote', { script: 'Anna mentions Melodifestivalen. It picks Sweden’s Eurovision song every spring, and {clip:0} half the country watches.' }),
  ],
  { primer: { gist: '', gistNative: '', themes: [], words: [{ ...term('tåg', 'train'), at: 1, clip: { start: 1, end: 2 } }, { ...term('fika', 'coffee break'), at: 3, clip: { start: 3, end: 4 } }, { ...term('hem', 'home'), at: 5, clip: { start: 5, end: 6 } }] } as any },
)

describe('the lesson recap (PC-1019-F01)', () => {
  it('picks words saved this listen first, then spotlight terms, then primer words, each once', () => {
    const words = recapWords(lesson, ['tåg', 'unknown'])
    expect(words.map((w) => w.word)).toEqual(['tåg', 'försenad', 'fika', 'hem'])
    expect(words[0]).toEqual({ word: 'tåg', meaning: 'train' })
    expect(enoughWords(words)).toBe(true)
  })

  it('finds a saved word’s meaning in the glossary, and keeps to five', () => {
    const many = plan(Array.from({ length: 8 }, (_, i) => moment(`m${i}`, 'spotlight', { term: term(`ord${i}`, `word ${i}`) })))
    expect(recapWords(many, ['katt'], { k: { lemma: 'katt', meaning: 'cat' } }).map((w) => w.word)).toEqual(['katt', 'ord0', 'ord1', 'ord2', 'ord3'])
    expect(recapWords(null, [])).toEqual([])
  })

  it('uses the line written for the card, else the first sentence of a culture note, else nothing', () => {
    expect(didYouKnow(plan([], { recap: { didYouKnow: 'Fika is a proper break, not just coffee.' } }))).toBe('Fika is a proper break, not just coffee.')
    expect(didYouKnow(lesson)).toBe('Anna mentions Melodifestivalen.')
    expect(didYouKnow(plan([]))).toBeUndefined()
    expect(didYouKnow(null)).toBeUndefined()
    const long = didYouKnow(plan([], { recap: { didYouKnow: Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ') } }))!
    expect(long.split(' ').length).toBe(25)
    expect(long.endsWith('…')).toBe(true)
  })

  it('shows minutes, the quiz score and podcasts completed, never a streak', () => {
    expect(statChips({ minutes: 23.6, quiz: { right: 2, of: 3 }, completed: 7 })).toEqual(['24 min listened', 'Quiz 2/3', '7 podcasts completed'])
    expect(statChips({ minutes: 0.2, completed: 1 })).toEqual(['1 min listened', '1 podcast completed'])
    expect(statChips({ minutes: 5, quiz: { right: 0, of: 0 } })).toEqual(['5 min listened'])
  })

  it('fits everything above the footer, even with long titles and a full card', () => {
    const long = 'A very long episode title that goes on and on about trains, fika, the weather and much more besides'
    const layout = recapLayout({
      languageName: 'Swedish',
      showTitle: long,
      episodeTitle: long,
      words: [1, 2, 3, 4, 5].map((i) => ({ word: `ordet${i}`, meaning: 'a meaning that is rather long and keeps on going for a while' })),
      didYouKnow: Array.from({ length: 25 }, () => 'word').join(' '),
      stats: { minutes: 64, quiz: { right: 3, of: 3 }, completed: 120 },
      guide: { id: 'mia', name: 'Mia' },
    })
    const top = layout.footerTop
    expect(layout.badge!.cy + layout.badge!.r).toBeLessThan(Math.min(...layout.chips.map((c) => c.y)))
    for (const t of layout.texts.slice(0, -1)) expect(bottomOf(t)).toBeLessThan(top)
    for (const c of layout.chips) {
      expect(c.y + c.height).toBeLessThanOrEqual(top)
      expect(c.x + c.width).toBeLessThanOrEqual(STORY.width - STORY.padding)
    }
    for (const r of layout.wordRows) expect(r.y).toBeLessThan(top)
    // Text never runs past the side margin.
    for (const t of layout.texts) for (const l of t.lines) expect(l.length * t.size * 0.53).toBeLessThanOrEqual(STORY.width - STORY.padding * 2 + 1)
  })

  it('leaves out the words and Did you know sections when there are none', () => {
    const layout = recapLayout({ languageName: 'French', showTitle: 'Show', episodeTitle: 'Ep', words: [], stats: { minutes: 10 } })
    expect(layout.wordRows).toEqual([])
    expect(layout.texts.some((t) => t.lines.includes('Did you know?'))).toBe(false)
    expect(layout.chips.map((c) => c.label)).toEqual(['10 min listened'])
  })
})

describe('the guide signs the recap card (PC-1021-10)', () => {
  it('names a word the learner picked up, in one of a few phrasings that stay the same for that word', () => {
    const line = guideSignOff('Mia', [{ word: 'fika', meaning: 'coffee break' }], { minutes: 10 }, 'Swedish')
    expect(line).toMatch(/^Mia: .*“fika”/)
    expect(guideSignOff('Mia', [{ word: 'fika', meaning: 'coffee break' }], { minutes: 3 }, 'Swedish')).toBe(line)
    expect(guideSignOff('Leo', [], { minutes: 10, quiz: { right: 2, of: 2 } }, 'French')).toBe('Leo: every question right, nicely done')
    expect(guideSignOff('Leo', [], { minutes: 10, quiz: { right: 1, of: 2 } }, 'French')).toBe('Leo: you followed a real French podcast')
    for (const w of ['fika', 'tåg', 'Schadenfreude', 'saudade']) expect(guideSignOff('Mia', [{ word: w, meaning: 'm' }], { minutes: 1 }, 'x')).not.toMatch(/!/)
  })

  it('puts the line and a small mark in the guide’s colour on the card, between the words and the chips', () => {
    const base = { languageName: 'Swedish', showTitle: 'Show', episodeTitle: 'Ep', words: [{ word: 'fika', meaning: 'coffee break' }], stats: { minutes: 10 } }
    const mia = recapLayout({ ...base, guide: { id: 'mia', name: 'Mia' } })
    const leo = recapLayout({ ...base, guide: { id: 'leo', name: 'Leo' } })
    expect(mia.texts.some((t) => t.lines.join(' ').startsWith('Mia: '))).toBe(true)
    expect(mia.badge).toMatchObject({ initial: 'M' })
    expect(leo.badge).toMatchObject({ initial: 'L' })
    expect(mia.badge!.colour).not.toBe(leo.badge!.colour)
    expect(recapLayout(base).badge).toBeUndefined()
  })

  it('keeps a very long word on one whole line, and a full card still fits', () => {
    const long = 'A very long episode title that goes on and on about trains, fika, the weather and much more besides'
    const layout = recapLayout({
      languageName: 'German',
      showTitle: long,
      episodeTitle: long,
      words: ['Rindfleischetikettierung', 'b', 'c', 'd', 'e'].map((word) => ({ word, meaning: 'a meaning that is rather long and keeps on going for a while' })),
      didYouKnow: Array.from({ length: 25 }, () => 'word').join(' '),
      stats: { minutes: 64, quiz: { right: 3, of: 3 }, completed: 120 },
      guide: { id: 'leo', name: 'Leo' },
    })
    const sign = layout.texts.find((t) => t.lines[0]!.startsWith('Leo: '))!
    expect(sign.lines).toHaveLength(1)
    expect(sign.lines[0]).toContain('“Rindfleischetikettierung”')
    expect(sign.lines[0]).not.toContain('…')
    for (const c of layout.chips) expect(c.y + c.height).toBeLessThanOrEqual(layout.footerTop)
  })
})

describe('word of the episode (PC-1019-F01)', () => {
  const segments: Segment[] = [{ id: 's1', start: 0, end: 3, text: 'Tåget var försenad igen.', translation: 'The train was late again.', wordStart: 0, wordEnd: 4 }]

  it('takes the first recap word with the host’s line it came from', () => {
    const w = wordOfTheEpisode([{ word: 'försenad', meaning: 'delayed' }], segments)
    expect(w).toEqual({ word: 'försenad', meaning: 'delayed', line: 'Tåget var försenad igen.' })
    expect(wordOfTheEpisode([], segments)).toBeUndefined()
    expect(wordOfTheEpisode([{ word: 'hem', meaning: 'home' }], segments)?.line).toBeUndefined()
  })

  it('fits on the orange card above the footer', () => {
    const layout = wordCardLayout({ word: 'försenad', meaning: 'delayed, running late', line: 'Tåget var försenad igen, som vanligt på måndagar när det snöar.' }, 'Svenska Samtal')
    const footer = layout.texts.slice(-2)
    for (const t of layout.texts.slice(0, -2)) expect(bottomOf(t)).toBeLessThan(footer[0]!.y - 40)
  })
})
