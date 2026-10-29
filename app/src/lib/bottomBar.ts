/** The four tabs, in order (PC-1017-F04: the same bar on every screen). */
export const TABS = [
  { id: 'index', title: 'Discover', icon: 'safari', href: '/' },
  { id: 'library', title: 'Library', icon: 'headphones', href: '/library' },
  { id: 'words', title: 'Words', icon: 'text.book.closed', href: '/words' },
  { id: 'you', title: 'You', icon: 'person.crop.circle', href: '/you' },
] as const

export type TabId = (typeof TABS)[number]['id']

/** Screens before the app proper (signing in, onboarding) don't show the bar. */
const NO_BAR = new Set(['welcome', 'email', 'onboarding'])

/**
 * Whether the bar shows on this route. On the iPhone the full player and the Plus and review sheets
 * slide over it; on the web preview they don't, so it steps aside for the full player there.
 */
export function barVisible(segments: string[], platform: string): boolean {
  const first = segments[0]
  if (!first || NO_BAR.has(first)) return false
  if (first === 'listen' && platform === 'web') return false
  return true
}

/** The highlighted tab: the one on screen, or, on a screen pushed over the tabs, the one it came from. */
export function activeTab(segments: string[], previous: TabId): TabId {
  if (segments[0] !== '(tabs)') return previous
  const tab = segments[1] ?? 'index'
  return (TABS.find((t) => t.id === tab)?.id ?? 'index') as TabId
}
