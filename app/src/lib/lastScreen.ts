import { createRef } from 'react'
import type { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import { freshShot, type ScreenShot } from './lastScreenCore'

/** The app's screens, wrapped in one view so it can be pictured (set in app/_layout.tsx). */
export const screenRoot = createRef<View>()

let last: ScreenShot | null = null

/** Pictures the screen now, small and quick; gives up after a moment so the tab never feels slow. */
export async function pictureScreen(screen: string): Promise<void> {
  if (!screenRoot.current) return
  try {
    const base64 = await Promise.race([
      captureRef(screenRoot, { format: 'jpg', quality: 0.6, width: 600, result: 'base64' }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow')), 250)),
    ])
    last = { base64, screen, at: Date.now() }
  } catch {
    last = null
  }
}

/** The picture from just before You opened, if it's recent. */
export function lastScreen(now = Date.now()): ScreenShot | null {
  return freshShot(last, now)
}

export function forgetLastScreen() {
  last = null
}
