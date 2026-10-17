/** Bar geometry from Finlay's original mark (viewBox 71 × 105): x, y, height; each bar 14 wide. */
export const BARS = [
  { x: 0, y: 0, h: 105 },
  { x: 19, y: 8, h: 67 },
  { x: 38, y: 19, h: 47 },
  { x: 57, y: 28, h: 30 },
] as const

export type Bar = (typeof BARS)[number]

/** How far each flag stem peeks out below the pole when tucked away, per stem (Finlay's Group 2 variant). */
export const PEEK = 8

/**
 * Where a bar starts when the mark arrives: the coloured stems tucked behind the orange pole, each
 * peeking a little further out below it, as in Finlay's scrapped stem logo. Offsets in mark units;
 * the pole itself doesn't move.
 */
export function tuckedOffset(bar: Bar, index: number): { dx: number; dy: number } {
  if (index === 0) return { dx: 0, dy: 0 }
  const pole = BARS[0]
  return { dx: pole.x - bar.x, dy: pole.y + pole.h + PEEK * index - (bar.y + bar.h) }
}
