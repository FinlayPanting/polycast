import { requireOptionalNativeModule } from 'expo'

type Subscription = { remove(): void }

interface PolycastCarPlayModule {
  /** What the car's list shows: "Carry on" and the followed shows (carPlayCore.ts). */
  setItems(items: { id: string; title: string; detail?: string }[], emptyText: string): void
  /** A short note on the car screen, e.g. when nothing from a show is ready yet. */
  showMessage(text: string): void
  addListener(event: 'onSelect', listener: (e: { id: string }) => void): Subscription
}

/** Missing on the web preview and in builds before CarPlay (PC-1022-10). */
export const PolycastCarPlay = requireOptionalNativeModule<PolycastCarPlayModule>('PolycastCarPlay')
