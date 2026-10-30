import { createAudioPlayer, type AudioStatus } from 'expo-audio'
import { useEffect, useRef } from 'react'
import { audioSource } from './userAgent'

/** A little past the clip's last word, so it doesn't clip the word's tail. */
export const CLIP_TAIL_SEC = 0.15
/** However long the clip takes to load, it gives up this long after the tap (a dead connection, a stalled seek). */
export const CLIP_GIVE_UP_MS = 15_000

/** Whether a host clip has reached its end: by where the audio actually is, not by a stopwatch (PC-1029-03). */
export function clipReachedEnd(status: Pick<AudioStatus, 'currentTime' | 'didJustFinish'>, end: number): boolean {
  return status.didJustFinish || status.currentTime >= end + CLIP_TAIL_SEC
}

/**
 * Plays the stretch of the episode from `start` to `end` and returns a function that stops it. It stops when the
 * audio reaches the clip's end, so a slow connection that takes a second to buffer still plays all of it (PC-1029-03).
 */
export async function playHostClip(audioUrl: string, start: number, end: number): Promise<() => void> {
  const p = createAudioPlayer(audioSource(audioUrl), { updateInterval: 50 })
  let stopped = false
  let playing = false
  let giveUp: ReturnType<typeof setTimeout> | undefined
  const sub = p.addListener('playbackStatusUpdate', (s) => {
    // Only once it has been asked to play from the clip's start: a status from before the seek says nothing.
    if (playing && clipReachedEnd(s, end)) stop()
  })
  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(giveUp)
    sub.remove()
    p.pause()
    p.remove()
  }
  giveUp = setTimeout(stop, CLIP_GIVE_UP_MS + Math.max(0, end - start) * 1000)
  try {
    await p.seekTo(start)
  } catch (e) {
    stop()
    throw e
  }
  if (stopped) return stop
  playing = true
  p.play()
  return stop
}

/** Plays the stretch of the episode where the host said a word (word review, the primer's words, the guessing game). */
export function useHostClip() {
  const stopCurrent = useRef<(() => void) | undefined>(undefined)
  const latest = useRef(0)
  useEffect(
    () => () => {
      latest.current++ // a clip still loading stops as soon as it's ready
      stopCurrent.current?.()
    },
    [],
  )
  return async (audioUrl: string, start: number, end: number) => {
    stopCurrent.current?.()
    stopCurrent.current = undefined
    const mine = ++latest.current
    const stop = await playHostClip(audioUrl, start, end)
    // Another tap came while this one was loading: only the newest clip plays.
    if (mine !== latest.current) stop()
    else stopCurrent.current = stop
  }
}
