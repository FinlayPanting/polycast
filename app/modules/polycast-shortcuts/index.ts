import { requireOptionalNativeModule } from 'expo'

type Subscription = { remove(): void }

interface PolycastShortcutsModule {
  /** The followed shows "Play the newest episode" offers. */
  setShows(shows: { id: string; title: string }[]): void
  /** The shortcut run most recently and not yet handled ("continue" or "show:<id>"), cleared as it's read. */
  takePending(): string | null
  addListener(event: 'onShortcut', listener: () => void): Subscription
}

/** Missing on the web preview and in builds before App Shortcuts (PC-1021-09). */
export const PolycastShortcuts = requireOptionalNativeModule<PolycastShortcutsModule>('PolycastShortcuts')
