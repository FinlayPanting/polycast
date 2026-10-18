import { createAudioPlayer, type AudioPlayer } from 'expo-audio'
import { useEffect, useRef } from 'react'

/** Plays the stretch of the episode where the host said a word (word review, the primer's words). */
export function useHostClip() {
  const player = useRef<AudioPlayer | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => {
    clearTimeout(timer.current)
    player.current?.remove()
  }, [])
  return async (audioUrl: string, start: number, end: number) => {
    clearTimeout(timer.current)
    player.current?.remove()
    const p = createAudioPlayer(audioUrl)
    player.current = p
    await p.seekTo(start)
    p.play()
    timer.current = setTimeout(() => p.pause(), Math.max(400, (end - start) * 1000 + 150))
  }
}
