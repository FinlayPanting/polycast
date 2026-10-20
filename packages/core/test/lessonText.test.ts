import { describe, expect, it } from 'vitest'
import { lessonText, type LessonPlan, type Segment, type Word } from '../src'

const words: Word[] = [
  { text: 'Tåget', start: 60, end: 60.5 },
  { text: 'är', start: 60.5, end: 60.7 },
  { text: 'försenat', start: 60.7, end: 61.4 },
  { text: 'igen.', start: 61.4, end: 61.8 },
  { text: 'Typiskt.', start: 63, end: 63.6 },
]
const segments: Segment[] = [
  { id: 's1', start: 60, end: 61.8, speaker: 'Anna', text: 'Tåget är försenat igen.', translation: 'The train is late again.', wordStart: 0, wordEnd: 4 },
  { id: 's2', start: 63, end: 63.6, speaker: 'Erik', text: 'Typiskt.', translation: 'Typical.', wordStart: 4, wordEnd: 5 },
]
const plan: LessonPlan = {
  episodeId: 'ep',
  version: 2,
  targetLanguage: 'sv',
  nativeLanguage: 'en',
  hosts: [{ name: 'Anna', description: 'the presenter' }],
  summary: 'Anna and Erik moan about trains.',
  moments: [
    { id: 'm2', kind: 'spotlight', at: 62, minLevel: 'standard', script: 'Anna said {clip:0}. Försenat means late.', clips: [{ start: 60.7, end: 61.4 }], term: { text: 'försenat', lemma: 'försenad', meaning: 'late, delayed' } },
    { id: 'm1', kind: 'warmup', at: 0, minLevel: 'light', script: 'This one is about trains.', clips: [] },
    { id: 'm3', kind: 'quickQuestion', at: 64, minLevel: 'handsOn', script: 'Quick one.', clips: [], question: { prompt: 'Is the train on time?', options: ['Yes', 'No'], answerIndex: 1 } },
  ],
  wrapUpQuestions: [{ prompt: 'What was late?', options: ['The bus', 'The train'], answerIndex: 1 }],
}

describe('a lesson as a readable page', () => {
  const page = lessonText({ title: 'Tåget', podcastTitle: 'Svenska Samtal', guideId: 'mia', plan, transcript: { segments, words } })

  it('opens with the episode, hosts, counts and summary', () => {
    expect(page).toContain('# Svenska Samtal: Tåget')
    expect(page).toContain('Lesson plan v2, sv for en speakers, guide mia.')
    expect(page).toContain('Hosts: Anna (the presenter).')
    expect(page).toContain('Moments: 3 (1 Warm-up, 1 Spotlight, 1 Quick question).')
    expect(page).toContain('**Summary:** Anna and Erik moan about trains.')
  })
  it('lists moments in time order with the host’s clips written into the script', () => {
    expect(page.indexOf('### 1. 0:00 · Warm-up · from light')).toBeGreaterThan(0)
    expect(page.indexOf('### 2. 1:02 · Spotlight · from standard')).toBeGreaterThan(page.indexOf('### 1.'))
    expect(page).toContain('**Guide:** Anna said [host: “försenat”]. Försenat means late.')
    expect(page).toContain('**Word:** försenat (försenad): late, delayed')
    expect(page).toContain('- clip 0 at 1:01–1:01: “försenat”')
  })
  it('shows the host lines around a moment, with translations', () => {
    expect(page).toContain('> 1:00 Anna: Tåget är försenat igen.\n>   _The train is late again._')
    expect(page).toContain('> 1:03 Erik: Typiskt.')
  })
  it('marks the right answers', () => {
    expect(page).toContain('**Question:** Is the train on time?\n-   Yes\n- ✓ No')
    expect(page).toContain('1. What was late?\n   -   The bus\n   - ✓ The train')
  })
})

describe('reported lines on the lesson page (PC-1018-04)', () => {
  const reports = [
    { segmentId: 's1', count: 1, lastAt: '2026-10-20T09:00:00Z' },
    { segmentId: 's2', count: 3, lastAt: '2026-10-19T09:00:00Z' },
    { segmentId: 'gone', count: 1, lastAt: '2026-10-18T09:00:00Z' },
  ]
  const page = lessonText({ title: 'Tåget', podcastTitle: 'Svenska Samtal', plan, transcript: { segments, words }, reports })

  it('come first, before the lesson plan, most reported first', () => {
    const at = page.indexOf('## Reported lines')
    expect(at).toBeGreaterThan(page.indexOf('# Svenska Samtal: Tåget'))
    expect(at).toBeLessThan(page.indexOf('Lesson plan v2'))
    expect(page.indexOf('> 1:03 Erik: Typiskt.\n>   _Typical._\n> (3 reports, last 2026-10-19)')).toBeLessThan(page.indexOf('> 1:00 Anna: Tåget är försenat igen.\n>   _The train is late again._\n> (1 report, last 2026-10-20)'))
    expect(page).toContain('> line gone is no longer in the transcript (1 report, last 2026-10-18)')
  })
  it('are left out when nobody has reported anything', () => {
    expect(lessonText({ title: 'Tåget', podcastTitle: 'Svenska Samtal', plan, transcript: { segments, words } })).not.toContain('Reported lines')
  })
})
