import { voiceIssues } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { REAL_HOST_LINE } from './copy'
import { searchOrMoodPlaceholder } from './mood'
import { PLUS_KEEP_GOING, plusOpener } from './plusOpener'
import { plusInvite } from './plusInvite'
import { guideSignOff } from './recap'

describe('the app’s fixed guide lines sound like Mia and Leo (PC-1028-09)', () => {
  const guides = ['Mia', 'Leo']

  it('recap sign-offs, for every phrasing', () => {
    const lines = new Set<string>()
    for (const g of guides) {
      for (const word of ['fika', 'försenad', 'mysig', 'genau', 'allora', 'tudo bem']) lines.add(guideSignOff(g, [{ word, meaning: 'x' } as any], {} as any, 'Swedish'))
      lines.add(guideSignOff(g, [], { quiz: { right: 3, of: 3 } } as any, 'Swedish'))
      lines.add(guideSignOff(g, [], {} as any, 'Swedish'))
    }
    expect(lines.size).toBeGreaterThanOrEqual(8)
    for (const l of lines) expect(voiceIssues(l), l).toEqual([])
  })

  it('the Plus card and screen', () => {
    const lines: string[] = [PLUS_KEEP_GOING]
    for (const g of guides)
      for (const [words, finished] of [[1, 0], [12, 0], [0, 1], [0, 4], [30, 6]] as const)
        lines.push(plusOpener({ words, finished, languageName: 'Swedish', guideName: g })!)
    for (const [sec, kept] of [[60, 0], [1500, 1], [1800, 7]] as const) {
      const p = plusInvite(true, sec, kept)!
      lines.push(p.summary, p.offer)
    }
    for (const l of lines) expect(voiceIssues(l), l).toEqual([])
  })

  it('the welcome promise and the search bar', () => {
    for (const l of [REAL_HOST_LINE, ...guides.map(searchOrMoodPlaceholder)]) expect(voiceIssues(l), l).toEqual([])
  })
})
