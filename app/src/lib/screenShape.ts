/**
 * Short, wide screens (PC-1019-05). The iPhone Duo's outer screen is about 1.45:1, where a tall phone is
 * about 2.17:1. Screens laid out for tall phones get less room there, so the player's big artwork shrinks
 * or steps aside rather than sitting on top of the title or pushing the controls off the bottom.
 */

/** Height over width below which a screen counts as short (tall iPhones are all above 2). */
export const SHORT_RATIO = 1.7

export function isShortScreen(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false
  return height / width < SHORT_RATIO
}

/**
 * Size of the player's artwork before the first line. On a tall phone: 168 with the guide's card showing, 260
 * without. On a short screen the guide's card needs the room, so the artwork steps aside (the header already
 * shows it small), and without the card it's 140.
 */
export function playerArtSize(width: number, height: number, guideOn: boolean): number {
  if (!isShortScreen(width, height)) return guideOn ? 168 : 260
  return guideOn ? 0 : 140
}

/** Widest the Plus screen's text column gets (PC-1026-02), so it reads as a column on a wide open display. */
export const PLUS_TEXT_MAX = 600
/** Widest the Plus screen's buy buttons get (PC-1026-02), so buying looks deliberate rather than stretched. */
export const PLUS_BUTTON_MAX = 400

export type PlusLayout = {
  /** Width of the centred text column; the full width on a phone. */
  columnWidth: number
  /** Width of the buy buttons. */
  buttonWidth: number
  /** Short, folded screens get the small print and links in one tight footer. */
  compactFooter: boolean
}

/**
 * The Plus screen on any shape (PC-1026-02), after RevenueCat's iPhone Duo paywall guidance: on the wide open
 * display the text keeps to about 600 points and the buttons to about 400, centred; on the short folded screen
 * the footer is compact. A tall phone (narrower than both limits) is laid out exactly as before.
 */
export function plusLayout(width: number, height: number, padding = 24): PlusLayout {
  const inner = Math.max(0, (width > 0 ? width : 0) - padding * 2)
  const columnWidth = Math.min(inner, PLUS_TEXT_MAX)
  return {
    columnWidth,
    buttonWidth: Math.min(columnWidth, PLUS_BUTTON_MAX),
    compactFooter: isShortScreen(width, height),
  }
}
