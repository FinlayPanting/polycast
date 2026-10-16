import { requireOptionalNativeModule } from 'expo'

interface PolycastFingerprintModule {
  /** Fingerprints a downloaded episode (file:// URI); returns the frames as base64. */
  fingerprint(uri: string): Promise<string>
  /** Keeps a file or folder out of iCloud backup. Missing in builds before 16 Oct 2026. */
  excludeFromBackup?(uri: string): boolean
}

/** Missing on the web preview and in older builds; callers then skip syncing. */
export const PolycastFingerprint = requireOptionalNativeModule<PolycastFingerprintModule>('PolycastFingerprint')
