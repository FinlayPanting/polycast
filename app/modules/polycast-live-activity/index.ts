import { requireOptionalNativeModule } from 'expo'

export interface LiveLinePayload {
  show: string
  line: string
  english: string
  next: string
  startMs: number
  endMs: number
}

interface PolycastLiveActivityModule {
  /** Whether this iPhone can show Live Activities (iOS 16.2 or later, and allowed in Settings). */
  isAvailable(): boolean
  /** Starts the lock-screen line, or updates the one showing. Resolves false if iOS refused. */
  show(line: LiveLinePayload): Promise<boolean>
  /** Takes the lock-screen line away. */
  end(): Promise<void>
}

/** Missing on the web preview and in builds before the Live Activity test (PC-1020-L1). */
export const PolycastLiveActivity = requireOptionalNativeModule<PolycastLiveActivityModule>('PolycastLiveActivity')
