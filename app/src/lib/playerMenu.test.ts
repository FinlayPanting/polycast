import { describe, expect, it } from 'vitest'
import { playerMenu } from './playerMenu'

describe("the player's More menu", () => {
  it('holds the intro replay and Line by line, with Cancel last', () => {
    expect(playerMenu({ hasIntro: true, guideSpeaking: false })).toEqual({
      actions: ['replayIntro', 'lineByLine'],
      options: ['Listen to the intro again', 'Line by line: pause after each line', 'Cancel'],
      cancelIndex: 2,
    })
  })

  it('leaves out the intro without one or while the guide is speaking', () => {
    expect(playerMenu({ hasIntro: false, guideSpeaking: false }).actions).toEqual(['lineByLine'])
    expect(playerMenu({ hasIntro: true, guideSpeaking: true }).actions).toEqual(['lineByLine'])
  })

  it('offers to turn Line by line off once it is on (PC-1018-07)', () => {
    expect(playerMenu({ hasIntro: false, guideSpeaking: false, lineByLine: true }).options).toEqual(['Turn off Line by line', 'Cancel'])
  })

  it("offers 'That line looks wrong' only while a subtitle line is showing (PC-1018-04)", () => {
    expect(playerMenu({ hasIntro: false, guideSpeaking: false, lineOnScreen: true })).toEqual({
      actions: ['lineByLine', 'reportLine'],
      options: ['Line by line: pause after each line', 'That line looks wrong', 'Cancel'],
      cancelIndex: 2,
    })
    expect(playerMenu({ hasIntro: false, guideSpeaking: false, lineOnScreen: false }).actions).not.toContain('reportLine')
  })
})
