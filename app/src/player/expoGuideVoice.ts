import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { plog } from '../lib/playbackLog'
import type { GuideVoice } from './types'

let modeSet: Promise<void> | undefined

/**
 * Puts the phone's audio session into exactly the setup Track Player uses (playback, default mode,
 * no mixing). Track Player re-applies its setup every time the episode plays, and expo-audio applied
 * a different one (mixWithOthers) the first time the guide spoke, so the two kept switching it. Each
 * switch can mute playback for a moment on a real iPhone: the guide's first line and the host clips
 * went silent. With identical setups the switches are no-ops. Call before the episode starts.
 */
export function prepareGuideAudio(): Promise<void> {
  modeSet ??= setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })
    .then(() => plog('audio session: playback, no mixing (same as the episode player)'))
    .catch((e) => {
      modeSet = undefined
      plog('audio session setup failed', String(e))
    })
  return modeSet
}

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
      await prepareGuideAudio()
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
        let guard = setTimeout(() => {
          if (player !== p) return
          plog('  voice: gave up after 15 s without it loading')
          stopCurrent()
        }, 15_000)
        finish = () => {
          clearTimeout(guard)
          resolve()
        }
        let timed = false
        let heard = false
        const name = url.split('/').pop()?.split('?')[0]
        plog(`  voice: load ${name}`)
        const sub = p.addListener('playbackStatusUpdate', (s) => {
          if (!heard && s.playing && s.currentTime > 0) {
            heard = true
            plog(`  voice: playing (loaded ${s.isLoaded}, buffering ${s.isBuffering}, volume ${p.volume}, muted ${p.muted}, length ${s.duration.toFixed(2)}s)`)
          }
          if (s.didJustFinish) plog(`  voice: finished at ${(s.currentTime ?? 0).toFixed(2)}s`)
          if (!timed && s.duration > 0) {
            timed = true
            clearTimeout(guard)
            guard = setTimeout(() => {
              if (player !== p) return
              plog('  voice: gave up 3 s after its length without finishing')
              stopCurrent()
            }, (s.duration + 3) * 1000)
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
