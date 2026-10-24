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
