import { describe, expect, it } from 'vitest'
import { isKindNudge, unkindReasons } from '../src/kindness'

describe('a kindness check on every nudge (PC-1026-07)', () => {
  it.each([
    'You gave up on Japanese',
    'Don’t give up now',
    'Don’t lose your streak',
    'Your 12-day streak ends tonight',
    'We miss you',
    'Mia: I miss you',
    'Have you forgotten about Swedish?',
    'It’s been 5 days since your last listen',
    'It has been a week',
    'You’re falling behind',
    'I’m a little disappointed',
    'Last chance to keep going',
    'You should practise today',
    'Where have you been?',
    'Time to listen!',
  ])('flags “%s”', (line) => {
    expect(isKindNudge(line)).toBe(false)
    expect(unkindReasons(line).length).toBeGreaterThan(0)
  })

  it.each([
    'Mia: A new episode’s out. Shall I get it ready for you?',
    'Mia: The new episode is ready when you are. I’ll be there at the pauses.',
    'Leo: “Folge 25” is ready to play with subtitles. I’m back to guide you on Monday.',
    'Your episode is ready',
    'Mia: “Fika på jobbet” (12 min) is a good one to start with. It’s ready when you are.',
  ])('lets “%s” through', (line) => {
    expect(unkindReasons(line)).toEqual([])
  })
})
