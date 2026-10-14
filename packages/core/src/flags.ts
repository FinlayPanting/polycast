/**
 * The Polycast mark: a flagpole and three bars (spec: Design language). The pole is always brand
 * orange; the three bars show the brand gradient or a flag chosen by the learner.
 */

export const BRAND = {
  orange: '#FF9C18',
  coral: '#FA6752',
  magenta: '#D23193',
  violet: '#7F6FA4',
  ink: '#0D0D0F',
  /** Background of the app icon and logo tile (Finlay's logo, Oct 2026). */
  navy: '#1A1A30',
} as const

/** The logo tile: the mark is 105 tall on a 151 square, centred (Finlay's logo file). */
export const ICON_BACKGROUND = BRAND.navy
export const ICON_MARK_HEIGHT = 105 / 151

export const POLE_COLOUR = BRAND.orange

export interface MarkFlag {
  id: string
  label: string
  /** Languages this flag can represent. */
  languages: string[]
  /** The three bars, left to right. */
  bars: [string, string, string]
}

export const DEFAULT_MARK: MarkFlag = {
  id: 'polycast',
  label: 'Polycast',
  languages: [],
  bars: [BRAND.coral, BRAND.magenta, BRAND.violet],
}

export const FLAGS: MarkFlag[] = [
  { id: 'se', label: 'Sweden', languages: ['sv'], bars: ['#006AA7', '#FECC02', '#006AA7'] },
  { id: 'de', label: 'Germany', languages: ['de'], bars: ['#000000', '#DD0000', '#FFCE00'] },
  { id: 'at', label: 'Austria', languages: ['de'], bars: ['#C8102E', '#FFFFFF', '#C8102E'] },
  { id: 'fr', label: 'France', languages: ['fr'], bars: ['#0055A4', '#FFFFFF', '#EF4135'] },
  { id: 'it', label: 'Italy', languages: ['it'], bars: ['#009246', '#FFFFFF', '#CE2B37'] },
  { id: 'es', label: 'Spain', languages: ['es'], bars: ['#AA151B', '#F1BF00', '#AA151B'] },
  { id: 'mx', label: 'Mexico', languages: ['es'], bars: ['#006847', '#FFFFFF', '#CE1126'] },
  { id: 'pt', label: 'Portugal', languages: ['pt'], bars: ['#046A38', '#DA291C', '#FFE900'] },
  { id: 'br', label: 'Brazil', languages: ['pt'], bars: ['#009C3B', '#FFDF00', '#002776'] },
  { id: 'gb', label: 'United Kingdom', languages: ['en'], bars: ['#012169', '#FFFFFF', '#C8102E'] },
  { id: 'us', label: 'United States', languages: ['en'], bars: ['#B22234', '#FFFFFF', '#3C3B6E'] },
]

/** Flag choices for a target language; several when the language is spoken in several countries. */
export function flagsForLanguage(language: string): MarkFlag[] {
  return FLAGS.filter((f) => f.languages.includes(language))
}

/** Relative luminance (WCAG) of a hex colour. */
export function luminance(hex: string): number {
  const n = hex.replace('#', '')
  const channel = (i: number) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** Dark bars get a light outline so they show on the dark background (Germany's black stripe). */
export function needsOutline(hex: string, background: string = BRAND.navy): boolean {
  const a = luminance(hex)
  const b = luminance(background)
  const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  return contrast < 1.5
}

/** iOS alternate app icon name for a flag, as declared in the app config. */
export function alternateIconName(flagId: string): string | null {
  return flagId === DEFAULT_MARK.id ? null : `Flag${flagId.toUpperCase()}`
}
