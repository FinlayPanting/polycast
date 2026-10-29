import { describe, expect, it } from 'vitest'
import { GUESS_TELLS, guessReply } from './guessLanguage'
import { GUIDE_VOICE, voiceIssues } from './guideVoice'
import { SEASONAL_LINES, SEASONS } from './seasonal'
import { LAUNCH_LANGUAGES } from './types'

describe('Mia’s voice, written down and checked (PC-1028-09)', () => {
  it('is written down', () => {
    expect(GUIDE_VOICE.never.length).toBeGreaterThanOrEqual(5)
    expect(GUIDE_VOICE.length).toMatch(/140/)
  })

  it('catches what Mia would never say', () => {
    expect(voiceIssues('Mia: Amazing job!!')).toEqual(expect.arrayContaining(['childish praise', 'more than one exclamation mark']))
    expect(voiceIssues('Mia: Our AI picked this for you.')).toContain('talks about AI')
    expect(voiceIssues('Mia: You earned 50 points.')).toContain('game words')
    expect(voiceIssues('Mia: Keep your streak going')).toEqual(expect.arrayContaining(['game words', 'threatens a streak']))
    expect(voiceIssues('Mia: My favorite color')).toEqual(expect.arrayContaining(['American spelling (say "favourite")', 'American spelling (say "colour")']))
    expect(voiceIssues('Mia: This is GREAT 🎉')).toEqual(expect.arrayContaining(['shouting in capitals', 'emoji']))
    expect(voiceIssues(`Mia: ${'word '.repeat(40)}`)).toContain('longer than 140 characters')
    expect(voiceIssues(`${'word '.repeat(40)}.`, 'script')).toContain('a sentence over 35 words')
  })

  it('lets the guide sound like a person', () => {
    expect(voiceIssues('Mia: “Fika på jobbet” (12 min) is a good one to start with. It’s ready when you are.')).toEqual([])
    expect(voiceIssues('Mia: Swedish! The sing-song gave it away.')).toEqual([])
    expect(voiceIssues("A word like [[ÄLSKAR]], which means 'love'.", 'script')).toEqual([])
  })

  it('every fixed line in core sounds like Mia: seasonal notes and lines, guessing-game replies', () => {
    const lines: string[] = []
    for (const s of SEASONS) for (const m of Object.values(s.byLanguage)) lines.push(m!.note, m!.chip)
    for (const l of SEASONAL_LINES) lines.push(l.welcome, l.plusCard.replace('{language}', 'Swedish'))
    for (const a of LAUNCH_LANGUAGES) for (const g of ['sv', 'de']) lines.push(guessReply('Mia', a, g), guessReply('Leo', a, g))
    expect(Object.keys(GUESS_TELLS)).toHaveLength(6)
    expect(lines.length).toBeGreaterThan(20)
    for (const l of lines) expect(voiceIssues(l), l).toEqual([])
  })
})
