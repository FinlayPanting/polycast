import { describe, expect, it } from 'vitest'
import { assignWordMomentLevels, includes, selectMoments, validateMoments, type GuideMoment } from '../src'

const moment = (over: Partial<GuideMoment> & Pick<GuideMoment, 'id' | 'kind' | 'at' | 'minLevel'>): GuideMoment => ({
  script: 'Test',
  clips: [],
  ...over,
})

describe('guidance levels', () => {
  it('nests Light inside Standard inside Hands-on', () => {
    expect(includes('handsOn', 'light')).toBe(true)
    expect(includes('standard', 'handsOn')).toBe(false)
    expect(includes('light', 'standard')).toBe(false)
  })
})

describe('word moment spacing', () => {
  it('gives Standard the best terms at least 4 minutes apart and Hands-on more at least 2 minutes apart', () => {
    const candidates = [
      { termId: 'a', occursAt: 60, priority: 9 },
      { termId: 'b', occursAt: 150, priority: 8 },
      { termId: 'c', occursAt: 330, priority: 7 },
      { termId: 'd', occursAt: 200, priority: 6 },
      { termId: 'e', occursAt: 600, priority: 5 },
      { termId: 'f', occursAt: 460, priority: 4 },
    ]
    const levels = assignWordMomentLevels(candidates)
    expect(levels.get('a')).toBe('standard')
    expect(levels.get('c')).toBe('standard')
    expect(levels.get('e')).toBe('standard')
    expect(levels.get('b')).toBe(undefined) // too close to a and c even for Hands-on
    expect(levels.get('f')).toBe('handsOn')
    expect(levels.get('d')).toBe('handsOn')

    const standard = candidates.filter((c) => levels.get(c.termId) === 'standard').map((c) => c.occursAt)
    standard.sort((x, y) => x - y)
    for (let i = 1; i < standard.length; i++) expect(standard[i]! - standard[i - 1]!).toBeGreaterThanOrEqual(240)
  })

  it('prefers the more useful term when two compete for the same slot', () => {
    const levels = assignWordMomentLevels([
      { termId: 'weak', occursAt: 100, priority: 1 },
      { termId: 'strong', occursAt: 110, priority: 5 },
    ])
    expect(levels.get('strong')).toBe('standard')
    expect(levels.get('weak')).toBe(undefined)
  })
})

describe('selecting moments for a listen', () => {
  const moments: GuideMoment[] = [
    moment({ id: 'w', kind: 'warmup', at: 0, minLevel: 'light' }),
    moment({ id: 'l1', kind: 'listenFor', at: 300, minLevel: 'standard', termId: 't1' }),
    moment({ id: 'cp', kind: 'checkpoint', at: 300, minLevel: 'light' }),
    moment({ id: 's0', kind: 'spotlight', at: 300, minLevel: 'standard', termId: 't0' }),
    moment({ id: 'cn', kind: 'cultureNote', at: 420, minLevel: 'standard' }),
    moment({ id: 'q', kind: 'quickQuestion', at: 500, minLevel: 'handsOn', waits: true }),
    moment({ id: 'end', kind: 'wrapUp', at: 2400, minLevel: 'light' }),
  ]

  it('Light keeps checkpoints and the wrap-up, with the warm-up off by default', () => {
    expect(selectMoments(moments, 'light').map((m) => m.id)).toEqual(['cp', 'end'])
    expect(selectMoments(moments, 'light', { warmup: true }).map((m) => m.id)).toEqual(['w', 'cp', 'end'])
  })

  it('plays looking-back moments before the next listen-for at a shared break', () => {
    expect(selectMoments(moments, 'standard').map((m) => m.id)).toEqual(['w', 'cp', 's0', 'l1', 'cn', 'end'])
  })

  it('Hands-on adds quick questions, and the warm-up can be skipped', () => {
    expect(selectMoments(moments, 'handsOn', { warmup: false }).map((m) => m.id)).toContain('q')
    expect(selectMoments(moments, 'handsOn', { warmup: false }).map((m) => m.id)).not.toContain('w')
  })
})

describe('lesson plan validation', () => {
  const term = { text: 'försenad', lemma: 'försenad', meaning: 'delayed' }

  it('accepts a well-formed word moment', () => {
    const ok = [
      moment({ id: 'a', kind: 'listenFor', at: 10, minLevel: 'standard', termId: 't', term }),
      moment({ id: 'b', kind: 'spotlight', at: 40, minLevel: 'standard', termId: 't', term, script: 'Listen: {clip:0}', clips: [{ start: 20, end: 20.6 }] }),
    ]
    expect(validateMoments(ok, 600)).toEqual([])
  })

  it('catches missing clips, broken questions, unpaired and out-of-order word moments', () => {
    const bad = [
      moment({ id: 'a', kind: 'spotlight', at: 10, minLevel: 'standard', termId: 't', term, script: '{clip:1}' }),
      moment({ id: 'b', kind: 'listenFor', at: 40, minLevel: 'standard', termId: 't', term }),
      moment({ id: 'q', kind: 'quickQuestion', at: 50, minLevel: 'handsOn', question: { prompt: '?', options: ['ja'], answerIndex: 0 } }),
      moment({ id: 'u', kind: 'listenFor', at: 60, minLevel: 'standard', termId: 'u', term }),
      moment({ id: 'x', kind: 'checkpoint', at: 9999, minLevel: 'light' }),
    ]
    const problems = validateMoments(bad, 600).map((p) => `${p.momentId}: ${p.problem}`)
    expect(problems).toEqual(
      expect.arrayContaining([
        'a: script refers to missing clip 1',
        'q: question needs 2+ options and a valid answer',
        'x: outside the episode',
        't: listen-for must come before its spotlight',
        'u: word moment needs both listen-for and spotlight',
      ]),
    )
  })
})

describe('target-language runs in guide scripts', () => {
  it('splits marked target-language text from the guide\'s own language', async () => {
    const { languageRuns, withoutLanguageMarks } = await import('../src/guide')
    expect(languageRuns('On the board you\'ll see [[tåget är försenat]], the train is late.')).toEqual([
      { text: 'On the board you\'ll see ', target: false },
      { text: 'tåget är försenat', target: true },
      { text: ', the train is late.', target: false },
    ])
    expect(languageRuns('[[Hej]]')).toEqual([{ text: 'Hej', target: true }])
    expect(languageRuns('No marks [here]')).toEqual([{ text: 'No marks [here]', target: false }])
    expect(withoutLanguageMarks('Say [[tack]] and [[hej då]].')).toBe('Say tack and hej då.')
  })
})
