import TrackPlayer, { Event } from 'react-native-track-player'
import type { RemoteCommand } from './types'

type Handler = (cmd: RemoteCommand) => void
let handler: Handler | undefined

/** The screen running a listen registers here to receive headphone and lock-screen presses. */
export function setRemoteHandler(h: Handler | undefined): void {
  handler = h
}

/**
 * Track player's background service: runs even when the app is in the background, and forwards
 * presses to the current listen. Registered once in index.ts.
 */
export async function playbackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => handler?.('play'))
  TrackPlayer.addEventListener(Event.RemotePause, () => handler?.('pause'))
  TrackPlayer.addEventListener(Event.RemoteNext, () => handler?.('next'))
  TrackPlayer.addEventListener(Event.RemotePrevious, () => handler?.('previous'))
  TrackPlayer.addEventListener(Event.RemoteJumpForward, () => handler?.('next'))
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, () => handler?.('previous'))
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => handler?.({ seek: e.position }))
  // A phone call or another app taking the audio: pause, so the guide isn't left talking over it
  // (the episode may already be paused for the guide, so iOS alone wouldn't stop the lesson).
  TrackPlayer.addEventListener(Event.RemoteDuck, (e) => {
    if (e.paused || e.permanent) handler?.('pause')
  })
}
