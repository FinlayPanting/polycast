import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import type { GuideVoice } from './types'

let modeSet = false

/** The guide's voice through expo-audio. Mixes with the episode player so neither cuts the other off. */
export function expoGuideVoice(): GuideVoice {
  let player: AudioPlayer | undefined
  let finish: (() => void) | undefined

  const stopCurrent = () => {
    player?.pause()
    player?.remove()
    player = undefined
    const f = finish
    finish = undefined
    f?.()
  }

  return {
    async play(url) {
      if (!modeSet) {
        await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'mixWithOthers' })
        modeSet = true
      }
      stopCurrent()
      return new Promise<void>((resolve) => {
        // keepAudioSessionActive: by default expo-audio switches the app's audio session off ~100 ms
        // after a player stops. On a real iPhone that also silences the episode player (Track
        // Player shares the same session): host clips faded out after a moment, and the episode
        // stayed paused after the guide. The simulator doesn't enforce this, so it only showed on phones.
        const p = createAudioPlayer(url, { updateInterval: 200, keepAudioSessionActive: true })
        player = p
        // Never leave the listen stuck on a clip that won't load or never reports finishing: give
        // up 15 s after starting, or 3 s after its length once that's known, and carry on.
        let guard = setTimeout(() => player === p && stopCurrent(), 15_000)
        finish = () => {
          clearTimeout(guard)
          resolve()
        }
        let timed = false
        const sub = p.addListener('playbackStatusUpdate', (s) => {
          if (!timed && s.duration > 0) {
            timed = true
            clearTimeout(guard)
            guard = setTimeout(() => player === p && stopCurrent(), (s.duration + 3) * 1000)
          }
          if (s.didJustFinish) {
            sub.remove()
            if (player === p) stopCurrent()
          }
        })
        p.play()
      })
    },
    stop: stopCurrent,
  }
}
