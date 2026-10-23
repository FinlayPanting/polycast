import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event, IOSCategory, IOSCategoryMode } from 'react-native-track-player'
import { plog } from '../lib/playbackLog'
import { POLYCAST_USER_AGENT, audioHeaders } from '../lib/userAgent'
import type { EpisodeAudio } from './types'

let setup: Promise<void> | undefined

/** Sets the player up once per app launch, with lock-screen and headphone controls. */
function ensureSetup(): Promise<void> {
  setup ??= (async () => {
    try {
      // Must match the guide voice's setup (expoGuideVoice: playback, default mode, no mixing), so
      // neither library switches the session under the other.
      await TrackPlayer.setupPlayer({ iosCategory: IOSCategory.Playback, iosCategoryMode: IOSCategoryMode.Default, iosCategoryOptions: [], autoHandleInterruptions: true })
    } catch (e) {
      // Already set up (e.g. after a fast refresh in development).
      if (!String(e).includes('already been initialized')) throw e
    }
    TrackPlayer.addEventListener(Event.PlaybackState, (e) => plog(`  episode player: ${e.state}`))
    TrackPlayer.addEventListener(Event.RemoteDuck, (e) => plog(`  episode player: duck ${JSON.stringify(e)}`))
    TrackPlayer.addEventListener(Event.PlaybackError, (e) => plog(`  episode player error: ${e.message}`))
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
      await TrackPlayer.add({ url: track.url, userAgent: POLYCAST_USER_AGENT, headers: audioHeaders(track.url), title: track.title, artist: track.artist, artwork: track.artwork, duration: track.durationSec })
      if (startAt > 0) await TrackPlayer.seekTo(startAt)
    },
    play: () => TrackPlayer.play(),
    pause: () => TrackPlayer.pause(),
    seek: (s) => TrackPlayer.seekTo(s),
    position: () => TrackPlayer.getPosition(),
    async setVolume(v) {
      await TrackPlayer.setVolume(v)
      if (v === 0 || v === 1) plog(`  episode volume ${v}`)
    },
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
