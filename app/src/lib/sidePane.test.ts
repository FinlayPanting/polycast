import type { GuideMoment, LessonPlan } from '@polycast/core'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isTwoPane, noteText, notesSoFar, primerWordsSoFar, savedWithMeanings } from './sidePane'

const m = (id: string, at: number, kind: GuideMoment['kind'], script: string, extra: Partial<GuideMoment> = {}): GuideMoment => ({
  id,
  at,
  kind,
  minLevel: 'standard',
  script,
  clips: [],
  ...extra,
})

const plan = {
  episodeId: 'e1',
  version: 4,
  targetLanguage: 'sv',
  nativeLanguage: 'en',
  hosts: [],
  summary: '',
  wrapUpQuestions: [],
  moments: [
    m('w', 0, 'warmup', 'Today they talk about [[fika]].'),
    m('s1', 60, 'spotlight', 'Listen: {clip:0} means delayed.', { clips: [{ start: 58, end: 59 }], term: { text: 'försenad', lemma: 'försenad', meaning: 'delayed' } }),
    m('q', 90, 'quickQuestion', 'What did she order?', { question: { prompt: 'What?', options: ['a', 'b'], answerIndex: 0 } }),
    m('hands', 100, 'cultureNote', 'Only on hands-on.', { minLevel: 'handsOn' }),
    m('c', 200, 'cultureNote', 'Later note.'),
    m('end', 300, 'wrapUp', 'Well done.'),
  ],
  primer: {
    gist: '',
    gistNative: '',
    themes: [],
    words: [
      { text: 'fika', lemma: 'fika', meaning: 'coffee break', at: 10, clip: { start: 10, end: 11 } },
      { text: 'tåget', lemma: 'tåg', meaning: 'train', at: 150, clip: { start: 150, end: 151 } },
    ],
  },
} as LessonPlan

describe('two panes on the open iPhone Duo (PC-1026-03)', () => {
  it('is two panes only on a wide, tall window (the open display, either way round)', () => {
    expect(isTwoPane(1100, 820)).toBe(true)
    expect(isTwoPane(820, 1100)).toBe(true)
    expect(isTwoPane(402, 584)).toBe(false) // folded outer screen
    expect(isTwoPane(402, 874)).toBe(false) // tall iPhone
    expect(isTwoPane(874, 402)).toBe(false) // a phone on its side
  })

  it('writes the host’s clips into the guide’s notes and drops the language marks', () => {
    expect(noteText(plan.moments[1]!, () => 'Tåget är försenat')).toBe('Listen: “Tåget är försenat” means delayed.')
    expect(noteText(plan.moments[0]!, () => '')).toBe('Today they talk about fika.')
  })

  it('shows only what has come up, newest first, at this listen’s level, without questions or the wrap-up', () => {
    const notes = notesSoFar(plan, 'standard', 120, () => 'x')
    expect(notes.map((n) => n.id)).toEqual(['s1', 'w'])
    expect(notes[0]!.term).toEqual({ text: 'försenad', meaning: 'delayed' })
    expect(notesSoFar(plan, 'handsOn', 120, () => 'x').map((n) => n.id)).toEqual(['hands', 's1', 'w'])
    expect(notesSoFar(plan, 'standard', 400, () => 'x').map((n) => n.id)).toEqual(['c', 's1', 'w'])
    expect(notesSoFar(undefined, 'standard', 400, () => 'x')).toEqual([])
  })

  it('marks which primer words the host has said so far', () => {
    expect(primerWordsSoFar(plan, 100).map((w) => [w.text, w.heard])).toEqual([
      ['fika', true],
      ['tåget', false],
    ])
    expect(primerWordsSoFar({ ...plan, primer: undefined }, 100)).toEqual([])
  })

  it('lists words saved this listen, newest first, with meanings from the glossary', () => {
    const glossary = { tåget: { lemma: 'tåg', meaning: 'train' }, försenat: { lemma: 'försenad', meaning: 'delayed' } }
    expect(savedWithMeanings(['tåg', 'okänd', 'tåg'], glossary)).toEqual([{ lemma: 'okänd' }, { lemma: 'tåg', meaning: 'train' }])
    expect(savedWithMeanings([], undefined)).toEqual([])
  })

  it('leaves the folded and phone player as one pane', () => {
    const source = readFileSync(new URL('../app/listen/[id].tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/flexDirection: twoPane \? 'row' : 'column'/)
    expect(source).toMatch(/\{twoPane \? \(\s*<SidePane/)
  })
})
