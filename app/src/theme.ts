import { BRAND } from '@polycast/core'
import { useColorScheme } from 'react-native'

/**
 * Polycast's look (spec: Design language). Dark by default, following the phone. Brand colours carry
 * meaning: orange is play and progress, magenta only appears when the guide speaks, coral marks saved
 * words, violet marks levels.
 */
type Base = {
  bg: string
  raised: string
  sunken: string
  line: string
  text: string
  quiet: string
  faint: string
  onAccent: string
  /** Brand colours adjusted so text in them meets WCAG AA (4.5:1) on this background. */
  playText: string
  guideText: string
  savedText: string
  levelText: string
}

const dark: Base = {
  // Navy, from Finlay's logo (Oct 2026), so the app matches its icon and launch screen.
  bg: BRAND.navy,
  raised: '#24243D',
  sunken: '#12121F',
  line: '#33334D',
  text: '#EDEBE7',
  quiet: '#9A98A3',
  faint: '#9391A0',
  onAccent: BRAND.ink,
  playText: BRAND.orange,
  guideText: '#EE6FB8',
  savedText: '#FC8A7A',
  levelText: '#B3A7DD',
}

const light: Base = {
  bg: '#F6F6F8',
  raised: '#FFFFFF',
  sunken: '#ECECF0',
  line: '#DEDEE4',
  text: '#16151A',
  quiet: '#6A6873',
  faint: '#6E6B76',
  onAccent: BRAND.ink,
  playText: '#A35400',
  guideText: '#B0207A',
  savedText: '#C23A27',
  levelText: '#5E4E91',
}

export const accents = {
  play: BRAND.orange,
  guide: BRAND.magenta,
  saved: BRAND.coral,
  level: BRAND.violet,
}

export type Palette = Base & typeof accents

export function usePalette(): Palette {
  const scheme = useColorScheme()
  return { ...(scheme === 'light' ? light : dark), ...accents }
}

/** One family, Figtree, with a scale built from 17pt body text. */
export const font = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
}

export const type = {
  title: { fontFamily: font.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.4 },
  heading: { fontFamily: font.semibold, fontSize: 21, lineHeight: 27, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 17, lineHeight: 24 },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 19 },
  smallStrong: { fontFamily: font.semibold, fontSize: 14, lineHeight: 19 },
  /** The hero text: the line being spoken, in the language being learned. */
  subtitle: { fontFamily: font.semibold, fontSize: 26, lineHeight: 34, letterSpacing: -0.2 },
  translation: { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
} as const

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }

/** Tap targets are at least 44 points (spec: Layout). */
export const MIN_TAP = 44

/** Motion: short and soft, 200–300 ms (spec: Motion and feel). */
export const motion = { quick: 200, standard: 280 }
