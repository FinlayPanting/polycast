import { describe, expect, it } from 'vitest'
import { playerMenu } from './playerMenu'

describe("the player's More menu", () => {
  it('holds the intro replay, with Cancel last', () => {
    expect(playerMenu({ hasIntro: true, guideSpeaking: false })).toEqual({ actions: ['replayIntro'], options: ['Listen to the intro again', 'Cancel'], cancelIndex: 1 })
  })

  it('is empty without an intro or while the guide is speaking, so the button hides', () => {
    expect(playerMenu({ hasIntro: false, guideSpeaking: false }).actions).toEqual([])
    expect(playerMenu({ hasIntro: true, guideSpeaking: true }).actions).toEqual([])
  })
})
