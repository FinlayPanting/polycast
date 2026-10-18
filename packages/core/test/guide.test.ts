import { describe, expect, it } from 'vitest'
import { assignMomentLevels, GUIDE_SPACING, LEVELS, includes, selectMoments, validateMoments, voiceSegments, type GuideMoment } from '../src'

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

describe('ranked moments and spacing (PC-1017-F13, F14)', () => {
  const unit = (id: string, at: number, priority: number, floor: 'light' | 'standard' | 'handsOn' = 'light', end = at) => ({ id, start: at, end, priority, floor })

  it('gives Light the best moments about 5 minutes apart, Standard about 3 and Hands-on about 1', () => {
    // A candidate every minute for 20 minutes, usefulness varying.
    const units = Array.from({ length: 20 }, (_, i) => unit(`u${i}`, 60 + i * 60, (i * 7) % 10))
    const levels = assignMomentLevels(units)
    const times = (level: 'light' | 'standard' | 'handsOn') =>
      units.filter((u) => { const l = levels.get(u.id); return l && LEVELS.indexOf(l) <= LEVELS.indexOf(level) }).map((u) => u.start).sort((a, b) => a - b)
    for (const level of LEVELS) {
      const t = times(level)
      for (let i = 1; i < t.length; i++) expect(t[i]! - t[i - 1]!).toBeGreaterThanOrEqual(GUIDE_SPACING[level])
    }
    expect(times('light').length).toBeGreaterThanOrEqual(3)
    expect(times('standard').length).toBeGreaterThan(times('light').length)
    expect(times('handsOn')).toHaveLength(20) // a minute apart: every one fits
  })

  it('prefers the more useful moment when two compete for the same slot', () => {
    const levels = assignMomentLevels([unit('weak', 100, 1), unit('strong', 110, 5)])
    expect(levels.get('strong')).toBe('light')
    expect(levels.get('weak')).toBe(undefined)
  })

  it('keeps clear of the fixed moments and never goes lighter than a moment’s floor', () => {
    const levels = assignMomentLevels([unit('nearRecap', 320, 9), unit('q', 900, 9, 'handsOn'), unit('note', 1300, 9, 'standard')], [0, 300])
    expect(levels.get('nearRecap')).toBe(undefined) // 20 s after a recap
    expect(levels.get('q')).toBe('handsOn')
    expect(levels.get('note')).toBe('standard')
  })

  it('measures a word moment from its listen-for to its spotlight', () => {
    const levels = assignMomentLevels([unit('pair', 100, 9, 'light', 160), unit('close', 190, 8)])
    expect(levels.get('pair')).toBe('light')
    expect(levels.get('close')).toBe(undefined) // 30 s after the spotlight
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

describe('voice segments', () => {
  it('splits every [[ ]] run out for a voice that reads one language at a time', () => {
    expect(voiceSegments('You might say: [[Jag är lite försenad]], I’m running a bit late.', { mixed: false })).toEqual([
      { text: 'You might say:', target: false },
      { text: 'Jag är lite försenad', target: true },
      { text: ', I’m running a bit late.', target: false },
    ])
  })

  it('sends a mixed line as one call to Eleven v4, keeping the slow repeat of a term on its own', () => {
    expect(voiceSegments('You might say: [[Jag är lite försenad]], I’m running a bit late.', { mixed: true })).toEqual([
      { text: 'You might say: Jag är lite försenad, I’m running a bit late.', target: false },
    ])
    // After the host's clip: the repeat stands alone, then the meaning carries on in one call.
    expect(voiceSegments('. [[försenad]]. It means delayed. Listen out for it.', { mixed: true })).toEqual([
      { text: 'försenad', target: true },
      { text: 'It means delayed. Listen out for it.', target: false },
    ])
    expect(voiceSegments('[[Tåget var försenat]]: the train was late. You might say: [[Jag är lite försenad]], I’m running a bit late.', { mixed: true })).toEqual([
      { text: 'Tåget var försenat', target: true },
      { text: 'the train was late. You might say: Jag är lite försenad, I’m running a bit late.', target: false },
    ])
    expect(voiceSegments('That word again. [[Feierabend]]. The end of the working day.', { mixed: true }).map((s) => s.target)).toEqual([false, true, false])
    expect(voiceSegments('A coffee break Swedes call [[fika]].', { mixed: true })).toEqual([{ text: 'A coffee break Swedes call fika.', target: false }])
  })
})
