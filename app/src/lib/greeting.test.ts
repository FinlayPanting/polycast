import { LAUNCH_LANGUAGES } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { ALL_WINKS, firstName, GREETING_LANGUAGES, greeting } from './greeting'

// Local times; 21 Oct 2026 is a Wednesday on an odd day number, 22 Oct an even one.
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0)
const evenDay = [20, 21, 22, 23].find((d) => Math.floor(Date.UTC(2026, 9, d) / 86_400_000) % 2 === 0)!
const oddDay = evenDay + 1

describe('Discover says hello in your new language (PC-1019-09)', () => {
  it('covers every launch language', () => {
    expect([...GREETING_LANGUAGES].sort()).toEqual([...LAUNCH_LANGUAGES].sort())
  })

  it('greets by time of day, with the English alongside', () => {
    expect(greeting('sv', at(oddDay, 8))).toEqual({ text: 'God morgon', english: 'Good morning' })
    expect(greeting('sv', at(oddDay, 20))).toMatchObject({ text: 'God kväll', english: 'Good evening' })
    expect(greeting('es', at(oddDay, 22))).toMatchObject({ text: 'Buenas noches' })
    expect(greeting('es', at(oddDay, 15))).toMatchObject({ text: 'Buenas tardes' })
    expect(greeting('de', at(oddDay, 12))).toMatchObject({ text: 'Guten Tag' })
  })

  it('carries the evening greeting on past midnight', () => {
    expect(greeting('fr', at(oddDay, 2))).toMatchObject({ text: 'Bonsoir' })
    expect(greeting('pt', at(oddDay, 3))).toMatchObject({ text: 'Boa noite' })
  })

  it('adds the first name when Polycast knows it', () => {
    expect(greeting('it', at(oddDay, 9), 'Finlay Panting')).toEqual({ text: 'Buongiorno, Finlay', english: 'Good morning, Finlay' })
    expect(firstName('abc123@privaterelay.appleid.com')).toBeUndefined()
    expect(firstName('  ')).toBeUndefined()
  })

  it('winks now and then: fika at 3 pm for Swedish, every other day', () => {
    expect(greeting('sv', at(evenDay, 15))?.wink).toEqual({ text: 'Dags för fika?', english: 'Fika time?' })
    expect(greeting('sv', at(oddDay, 15))?.wink).toBeUndefined()
    expect(greeting('sv', at(evenDay, 11))?.wink).toBeUndefined()
  })

  it('keeps weekday winks to their day', () => {
    const friday = new Date(2026, 9, 23, 19)
    const thursday = new Date(2026, 9, 22, 19)
    const evenFriday = Math.floor(Date.UTC(2026, 9, 23) / 86_400_000) % 2 === 0
    if (evenFriday) expect(greeting('sv', friday)?.wink?.english).toBe('A cosy Friday night in?')
    expect(greeting('sv', thursday)?.wink?.english).not.toBe('A cosy Friday night in?')
  })

  it('knows nothing for a language it has no list for', () => {
    expect(greeting('xx', at(oddDay, 9))).toBeUndefined()
    for (const winks of Object.values(ALL_WINKS)) for (const w of winks) expect(w.from).toBeLessThanOrEqual(w.to)
  })
})
