import { BRAND, DEFAULT_MARK, FLAGS, POLE_COLOUR } from '@polycast/core'
import { BARS } from './markGeometry'
import type { ShareableLine } from './shareLine'

/**
 * "Share a line" as a picture (PC-1017-08): a card in Polycast's colours with the host's line, its
 * meaning, credit to the show and the learner's flag on the mark. Words only, never the host's
 * audio, so nothing of the show is re-hosted. Laid out here as plain numbers so it can be tested;
 * `ShareCard` draws it with react-native-svg and turns it into a PNG.
 */

/** 4:5, which sits well in Stories (letterboxed on the navy) and in Messages. */
export const CARD = { width: 1080, height: 1350, padding: 96 } as const

export const CARD_COLOURS = {
  background: BRAND.navy,
  text: '#EDEBE7',
  quiet: '#B9B7C2',
  accent: BRAND.orange,
} as const

/** Figtree's average character width, as a share of its size; a little generous so lines never overflow. */
const CHAR_WIDTH = 0.53

export interface CardText {
  lines: string[]
  size: number
  lineHeight: number
  y: number
  colour: string
  weight: 'regular' | 'semibold'
}

export interface CardLayout {
  mark: { x: number; y: number; width: number; height: number; radius: number; colour: string }[]
  quote: CardText
  meaning: CardText
  credit: CardText
  link: CardText
}

/** Breaks text into lines of at most `maxChars`, at spaces; a single overlong word is cut with a hyphen. */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let current = ''
  for (let word of text.trim().split(/\s+/).filter(Boolean)) {
    while (word.length > maxChars) {
      if (current) {
        lines.push(current)
        current = ''
      }
      lines.push(`${word.slice(0, maxChars - 1)}-`)
      word = word.slice(maxChars - 1)
    }
    if (!current) current = word
    else if (current.length + 1 + word.length <= maxChars) current = `${current} ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

/** Keeps at most `max` lines, ending the last with an ellipsis if anything was left out. */
function clampLines(lines: string[], max: number): string[] {
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  kept[max - 1] = `${kept[max - 1]!.replace(/[\s.,;:!?…-]+$/, '')}…`
  return kept
}

const charsPerLine = (size: number) => Math.floor((CARD.width - CARD.padding * 2) / (size * CHAR_WIDTH))

export function cardLayout(line: ShareableLine, showTitle: string, flagId?: string | null): CardLayout {
  const flag = FLAGS.find((f) => f.id === flagId) ?? DEFAULT_MARK
  const markHeight = 150
  const scale = markHeight / 105
  const colours = [POLE_COLOUR, ...flag.bars]
  const mark = BARS.map((b, i) => ({
    x: CARD.padding + b.x * scale,
    y: CARD.padding + b.y * scale,
    width: 14 * scale,
    height: b.h * scale,
    radius: 7 * scale,
    colour: colours[i]!,
  }))

  const quoteText = `“${line.text}”`
  const quoteSize = quoteText.length <= 60 ? 68 : quoteText.length <= 110 ? 56 : 48
  const quoteLines = clampLines(wrapText(quoteText, charsPerLine(quoteSize)), 7)
  const quoteLineHeight = Math.round(quoteSize * 1.25)
  const quoteY = CARD.padding + markHeight + 110
  const quote: CardText = { lines: quoteLines, size: quoteSize, lineHeight: quoteLineHeight, y: quoteY, colour: CARD_COLOURS.text, weight: 'semibold' }

  const meaningSize = 40
  const meaningLineHeight = 54
  const meaningY = quoteY + quoteLines.length * quoteLineHeight + 40
  const meaning: CardText = {
    lines: clampLines(wrapText(line.translation, charsPerLine(meaningSize)), 5),
    size: meaningSize,
    lineHeight: meaningLineHeight,
    y: meaningY,
    colour: CARD_COLOURS.quiet,
    weight: 'regular',
  }

  const creditSize = 34
  const creditLines = clampLines(wrapText(`Caught on Polycast, from ${showTitle}`, charsPerLine(creditSize)), 2)
  const linkY = CARD.height - CARD.padding
  const credit: CardText = { lines: creditLines, size: creditSize, lineHeight: 46, y: linkY - 60 - (creditLines.length - 1) * 46, colour: CARD_COLOURS.quiet, weight: 'regular' }
  const link: CardText = { lines: ['polycast.app'], size: 34, lineHeight: 46, y: linkY, colour: CARD_COLOURS.accent, weight: 'semibold' }

  return { mark, quote, meaning, credit, link }
}

/** The last baseline a block of text reaches. */
export const bottomOf = (t: CardText) => t.y + (t.lines.length - 1) * t.lineHeight

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** The PNG from react-native-svg comes as base64; the file is written as bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let n = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]!)
    const b = B64.indexOf(clean[i + 1] ?? 'A')
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]!) : -1
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]!) : -1
    out[n++] = (a << 2) | (b >> 4)
    if (c >= 0) out[n++] = ((b & 15) << 4) | (c >> 2)
    if (d >= 0) out[n++] = ((c & 3) << 6) | d
  }
  return out.slice(0, n)
}
