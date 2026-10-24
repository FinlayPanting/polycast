import { describe, expect, it } from 'vitest'
import { isShortScreen, playerArtSize } from './screenShape'

describe('short, wide screens (PC-1019-05)', () => {
  it('treats the iPhone Duo outer screen as short and every tall iPhone as not', () => {
    expect(isShortScreen(402, 584)).toBe(true) // about 1.45:1
    expect(isShortScreen(375, 667)).toBe(false) // iPhone SE, 1.78:1
    expect(isShortScreen(402, 874)).toBe(false) // iPhone 17 Pro, 2.17:1
    expect(isShortScreen(0, 0)).toBe(false)
  })

  it('keeps the player artwork as it was on tall phones', () => {
    expect(playerArtSize(402, 874, true)).toBe(168)
    expect(playerArtSize(402, 874, false)).toBe(260)
  })

  it('makes room for the guide on a short screen', () => {
    expect(playerArtSize(402, 584, true)).toBe(0)
    expect(playerArtSize(402, 584, false)).toBe(140)
  })
})
