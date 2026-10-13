import { requireOptionalNativeModule } from 'expo'

interface PolycastFingerprintModule {
  /** Fingerprints a downloaded episode (file:// URI); returns the frames as base64. */
  fingerprint(uri: string): Promise<string>
}

/** Missing on the web preview and in older builds; callers then skip syncing. */
export const PolycastFingerprint = requireOptionalNativeModule<PolycastFingerprintModule>('PolycastFingerprint')
