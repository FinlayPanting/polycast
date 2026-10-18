import * as SecureStore from 'expo-secure-store'
import { api } from './api'
import { config } from './config'
import { ownKeysFrom, type OwnKeys } from './ownKeysCore'

export type { OwnKeys } from './ownKeysCore'

/**
 * The learner's own API keys (PC-1017-K1), kept in the iPhone Keychain and sent to the server only
 * with a preparation, over HTTPS. Never stored anywhere else on the phone.
 */
const NAMES = { elevenlabs: 'polycast.ownKey.elevenlabs', gemini: 'polycast.ownKey.gemini' } as const

export async function loadOwnKeys(): Promise<OwnKeys | undefined> {
  if (config.demo) return undefined
  try {
    const [elevenlabs, gemini] = await Promise.all([SecureStore.getItemAsync(NAMES.elevenlabs), SecureStore.getItemAsync(NAMES.gemini)])
    return ownKeysFrom(elevenlabs, gemini)
  } catch {
    return undefined
  }
}

/** Which keys are saved, without reading them out (for settings). */
export async function savedKeyNames(): Promise<{ elevenlabs: boolean; gemini: boolean }> {
  try {
    const [e, g] = await Promise.all([SecureStore.getItemAsync(NAMES.elevenlabs), SecureStore.getItemAsync(NAMES.gemini)])
    return { elevenlabs: Boolean(e), gemini: Boolean(g) }
  } catch {
    return { elevenlabs: false, gemini: false }
  }
}

export async function saveOwnKey(provider: keyof OwnKeys, key: string): Promise<void> {
  await SecureStore.setItemAsync(NAMES[provider], key.trim(), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY })
}

/** Removes the keys from this phone and asks the server to forget any copy a waiting job holds. */
export async function removeOwnKeys(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(NAMES.elevenlabs), SecureStore.deleteItemAsync(NAMES.gemini)])
  await api.forgetKeys().catch(() => undefined)
}
