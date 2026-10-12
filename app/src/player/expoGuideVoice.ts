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
        finish = resolve
        const p = createAudioPlayer(url, { updateInterval: 200 })
        player = p
        const sub = p.addListener('playbackStatusUpdate', (s) => {
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
