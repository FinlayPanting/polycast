import { describe, expect, it } from 'vitest'
import { isShortScreen, playerArtSize, plusLayout, PLUS_BUTTON_MAX, PLUS_TEXT_MAX } from './screenShape'

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

describe('the Plus screen on both iPhone Duo displays (PC-1026-02)', () => {
  it('keeps a tall phone exactly as it was: full width, normal footer', () => {
    expect(plusLayout(402, 874)).toEqual({ columnWidth: 354, buttonWidth: 354, compactFooter: false })
    expect(plusLayout(375, 667).compactFooter).toBe(false)
  })

  it('holds the text to 600 and the buy buttons to 400 on the wide open display', () => {
    const open = plusLayout(1100, 820)
    expect(open.columnWidth).toBe(PLUS_TEXT_MAX)
    expect(open.buttonWidth).toBe(PLUS_BUTTON_MAX)
  })

  it('holds the same limits when the open display is rotated', () => {
    const rotated = plusLayout(820, 1100)
    expect(rotated.columnWidth).toBe(600)
    expect(rotated.buttonWidth).toBe(400)
  })

  it('gives the folded outer screen a compact footer', () => {
    expect(plusLayout(402, 584)).toEqual({ columnWidth: 354, buttonWidth: 354, compactFooter: true })
  })

  it('never goes negative on a zero-sized first layout', () => {
    expect(plusLayout(0, 0)).toEqual({ columnWidth: 0, buttonWidth: 0, compactFooter: false })
  })
})
