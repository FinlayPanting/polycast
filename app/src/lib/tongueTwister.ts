import { TWISTER_SLOW_RATE } from '@polycast/core'
import { createAudioPlayer } from 'expo-audio'
import { GOODBYE_VERSION } from './goodbye'

/**
 * A tongue-twister for the curious (PC-1029-08). The server voices one per language and guide beside the goodbye
 * (server/src/goodbye.ts, `<guide>-twister`); the app loads its manifest with loadGoodbye and plays it here.
 */
export function twisterUrl(supabaseUrl: string, target: string, guideId = 'mia'): string {
  return `${supabaseUrl}/storage/v1/object/public/guide-audio/goodbye/v${GOODBYE_VERSION}/${target}/${guideId}-twister.json`
}

/** Plays the clip slowly (pitch kept), then once more as voiced. Resolves when both are done; the returned stop ends it early. */
export function playTwister(url: string): { done: Promise<void>; stop: () => void } {
  const p = createAudioPlayer(url, { updateInterval: 100 })
  let finish: () => void = () => {}
  const done = new Promise<void>((r) => (finish = r))
  let round = 0
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    sub.remove()
    p.pause()
    p.remove()
    finish()
  }
  const sub = p.addListener('playbackStatusUpdate', (s) => {
    if (!s.didJustFinish || stopped) return
    if (round === 0) {
      round = 1
      p.setPlaybackRate(1, 'high')
      void p.seekTo(0).then(() => !stopped && p.play())
    } else stop()
  })
  p.setPlaybackRate(TWISTER_SLOW_RATE, 'high')
  p.play()
  return { done, stop }
}
