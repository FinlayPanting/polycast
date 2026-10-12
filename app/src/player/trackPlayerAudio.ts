import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event, IOSCategory } from 'react-native-track-player'
import type { EpisodeAudio } from './types'

let setup: Promise<void> | undefined

/** Sets the player up once per app launch, with lock-screen and headphone controls. */
function ensureSetup(): Promise<void> {
  setup ??= (async () => {
    try {
      await TrackPlayer.setupPlayer({ iosCategory: IOSCategory.Playback, autoHandleInterruptions: true })
    } catch (e) {
      // Already set up (e.g. after a fast refresh in development).
      if (!String(e).includes('already been initialized')) throw e
    }
    await TrackPlayer.updateOptions({
      capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo, Capability.JumpForward, Capability.JumpBackward],
      forwardJumpInterval: 30,
      backwardJumpInterval: 15,
      progressUpdateEventInterval: 0.25,
      android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification },
    })
  })()
  return setup
}

/** The episode stream, through react-native-track-player: reliable background play and remote controls. */
export function trackPlayerAudio(): EpisodeAudio {
  return {
    async load(track, startAt = 0) {
      await ensureSetup()
      await TrackPlayer.reset()
      await TrackPlayer.add({ url: track.url, title: track.title, artist: track.artist, artwork: track.artwork, duration: track.durationSec })
      if (startAt > 0) await TrackPlayer.seekTo(startAt)
    },
    play: () => TrackPlayer.play(),
    pause: () => TrackPlayer.pause(),
    seek: (s) => TrackPlayer.seekTo(s),
    position: () => TrackPlayer.getPosition(),
    setVolume: (v) => TrackPlayer.setVolume(v),
    setRate: (r) => TrackPlayer.setRate(r),
    onProgress(listener) {
      const sub = TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (e) => listener(e.position))
      return () => sub.remove()
    },
    onEnded(listener) {
      const sub = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => listener())
      return () => sub.remove()
    },
    unload: () => TrackPlayer.reset(),
  }
}
