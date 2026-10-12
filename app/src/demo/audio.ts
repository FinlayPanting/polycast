import type { EpisodeAudio, GuideVoice } from '../player/types'

/** Pretend episode audio for demo mode: a clock that moves while "playing". */
export function demoAudio(durationSec: number): EpisodeAudio {
  let pos = 0
  let timer: ReturnType<typeof setInterval> | undefined
  const progress = new Set<(s: number) => void>()
  const ended = new Set<() => void>()
  const stop = () => {
    if (timer) clearInterval(timer)
    timer = undefined
  }
  return {
    async load(_t, startAt = 0) {
      pos = startAt
    },
    async play() {
      stop()
      timer = setInterval(() => {
        pos += 0.25
        progress.forEach((l) => l(pos))
        if (pos >= durationSec) {
          stop()
          ended.forEach((l) => l())
        }
      }, 250)
    },
    async pause() {
      stop()
    },
    async seek(s) {
      pos = s
    },
    async position() {
      return pos
    },
    async setVolume() {},
    async setRate() {},
    onProgress(l) {
      progress.add(l)
      return () => progress.delete(l)
    },
    onEnded(l) {
      ended.add(l)
      return () => ended.delete(l)
    },
    async unload() {
      stop()
    },
  }
}

/** Pretend guide voice: "speaks" for a second and a half per part. */
export function demoVoice(): GuideVoice {
  let finish: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    play() {
      return new Promise<void>((resolve) => {
        finish = resolve
        timer = setTimeout(resolve, 1500)
      })
    },
    stop() {
      if (timer) clearTimeout(timer)
      finish?.()
    },
  }
}
