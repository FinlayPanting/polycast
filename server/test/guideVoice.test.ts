import { describe, expect, it } from 'vitest'
import { voiceIssues } from '@polycast/core'
import { GOODBYE_LINES, GOODNIGHT_LINES } from '../src/goodbye'
import { allNotificationLines } from '../src/nudges'
import { WELCOME_SCRIPTS } from '../src/welcome'

describe('the server’s fixed guide lines sound like Mia and Leo (PC-1028-09)', () => {
  it('welcomes', () => {
    for (const [lang, script] of Object.entries(WELCOME_SCRIPTS)) {
      expect(voiceIssues(script, 'script'), lang).toEqual([])
      expect(script.startsWith("Hi, I'm Mia."), lang).toBe(true)
    }
  })

  it('goodbyes and goodnights, as the learner reads them', () => {
    for (const lines of [GOODBYE_LINES, GOODNIGHT_LINES]) for (const [lang, l] of Object.entries(lines)) expect(voiceIssues(l.meaning), lang).toEqual([])
  })

  it('every notification and nudge', () => {
    const lines = allNotificationLines()
    expect(lines.length).toBeGreaterThan(10)
    for (const l of lines) expect(voiceIssues(l), l).toEqual([])
  })
})
