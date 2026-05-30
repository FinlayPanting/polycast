import type { ProcessedEpisode } from './storage'
import { base64ToArrayBuffer } from './tts'

export interface AudioEngineMeta {
  title: string
  artist: string
  artwork?: string
}

interface AudioEngineCallbacks {
  onTimeUpdate: (t: number) => void
  onDurationChange: (d: number) => void
  onSummaryStart: (idx: number) => void
  onSummaryEnd: () => void
  onPlayStateChange: (playing: boolean) => void
}

const FADE_MS = 400

export class AudioEngine {
  private episodeAudio: HTMLAudioElement
  private summaryAudio: HTMLAudioElement
  private summaryAudioPrimed = false
  private processed: ProcessedEpisode
  private cb: AudioEngineCallbacks
  private summaryBlobUrls: (string | null)[]
  private summaryPlayed: boolean[]
  private inSummary = false
  private summaryInterrupted = false
  private pendingIntro: number | null = null
  private tickInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    processed: ProcessedEpisode,
    meta: AudioEngineMeta,
    cb: AudioEngineCallbacks,
    initialPosition = 0,
  ) {
    this.processed = processed
    this.cb = cb

    // Set summaryPlayed synchronously so togglePlay() sees the correct state immediately
    this.summaryPlayed = processed.summaries.map((s) => s.timestamp < initialPosition)

    this.summaryBlobUrls = processed.summaries.map((s) => {
      try {
        return URL.createObjectURL(new Blob([base64ToArrayBuffer(s.audioBase64)], { type: 'audio/mpeg' }))
      } catch {
        return null
      }
    })

    this.episodeAudio = new Audio()
    this.episodeAudio.preload = 'auto'
    this.episodeAudio.src = processed.enclosureUrl

    if (initialPosition > 0) {
      this.episodeAudio.addEventListener('loadedmetadata', () => {
        this.episodeAudio.currentTime = initialPosition
      }, { once: true })
    }

    this.episodeAudio.addEventListener('durationchange', () => {
      if (!this.inSummary) cb.onDurationChange(this.episodeAudio.duration)
    })
    this.episodeAudio.addEventListener('ended', () => {
      if (!this.inSummary) {
        cb.onPlayStateChange(false)
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
      }
    })

    this.summaryAudio = new Audio()
    this.summaryAudio.preload = 'none'

    this.tickInterval = setInterval(() => this.tick(), 250)
    this.setupMediaSession(meta)
  }

  // Uses a non-intro blob for priming so playSummary(0) always sets a fresh src
  private primeSummaryAudio() {
    const url = this.summaryBlobUrls.slice(1).find((u) => u !== null) ?? this.summaryBlobUrls[0]
    if (!url) return
    this.summaryAudio.volume = 0
    this.summaryAudio.src = url
    this.summaryAudio.play()
      .then(() => { this.summaryAudio.pause(); this.summaryAudioPrimed = true })
      .catch(() => {})
  }

  private tick() {
    if (this.pendingIntro !== null && this.summaryAudioPrimed && !this.inSummary) {
      const idx = this.pendingIntro
      this.pendingIntro = null
      this.playSummary(idx)
      return
    }

    if (this.inSummary || this.episodeAudio.paused) {
      if (!this.inSummary) this.cb.onTimeUpdate(this.episodeAudio.currentTime)
      return
    }
    const t = this.episodeAudio.currentTime
    this.cb.onTimeUpdate(t)

    const idx = this.processed.summaries.findIndex(
      (s, i) => !this.summaryPlayed[i] && t >= s.timestamp && t < s.timestamp + 1,
    )
    if (idx !== -1 && this.summaryBlobUrls[idx] && this.summaryAudioPrimed) {
      this.playSummary(idx)
    } else if (idx !== -1 && !this.summaryAudioPrimed) {
      this.summaryPlayed[idx] = true
    }
  }

  private async playSummary(idx: number) {
    if (this.inSummary) return
    this.inSummary = true
    this.summaryPlayed[idx] = true

    // Only fade/pause if episode is currently playing (intro at t=0 may not have started)
    if (!this.episodeAudio.paused) {
      await this.fadeVolume(this.episodeAudio, 1, 0, FADE_MS)
      this.episodeAudio.pause()
    }
    this.cb.onSummaryStart(idx)

    this.summaryAudio.pause()
    this.summaryAudio.src = this.summaryBlobUrls[idx]!
    this.summaryAudio.currentTime = 0
    this.summaryAudio.volume = 1

    try {
      await this.summaryAudio.play()
      await new Promise<void>((resolve) => {
        const done = () => resolve()
        this.summaryAudio.addEventListener('ended', done, { once: true })
        this.summaryAudio.addEventListener('error', done, { once: true })
      })
    } catch { /* summary failed, continue */ }

    const interrupted = this.summaryInterrupted
    this.summaryInterrupted = false
    this.inSummary = false
    this.cb.onSummaryEnd()

    if (!interrupted) {
      this.episodeAudio.volume = 0
      this.episodeAudio.play().catch(() => {})
      this.cb.onPlayStateChange(true)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
      await this.fadeVolume(this.episodeAudio, 0, 1, FADE_MS)
    } else {
      this.episodeAudio.volume = 1
    }
  }

  // Fade with lock-screen safety: if visibilityState becomes 'hidden' mid-fade,
  // immediately jump to the target volume so the Promise always resolves.
  private fadeVolume(el: HTMLAudioElement, from: number, to: number, ms: number): Promise<void> {
    // Already locked — skip animation entirely
    if (document.visibilityState === 'hidden') {
      el.volume = to
      return Promise.resolve()
    }

    const steps = 16
    const dt = ms / steps
    const dv = (to - from) / steps
    let v = from
    el.volume = v
    let done = false

    return new Promise((resolve) => {
      const finish = () => {
        if (done) return
        done = true
        el.volume = to
        document.removeEventListener('visibilitychange', onHidden)
        resolve()
      }

      // If screen locks during the fade, jump to target immediately
      const onHidden = () => {
        if (document.visibilityState === 'hidden') finish()
      }
      document.addEventListener('visibilitychange', onHidden)

      const step = () => {
        if (done) return
        v += dv
        el.volume = Math.max(0, Math.min(1, v))
        if ((dv > 0 && v >= to) || (dv <= 0 && v <= to)) {
          finish()
        } else {
          setTimeout(step, dt)
        }
      }
      setTimeout(step, dt)
    })
  }

  togglePlay() {
    if (this.inSummary) {
      // Interrupt summary cleanly — dispatch 'ended' to unblock the playSummary Promise
      this.summaryInterrupted = true
      this.summaryAudio.pause()
      this.summaryAudio.dispatchEvent(new Event('ended'))
      this.cb.onPlayStateChange(false)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
      return
    }

    if (this.episodeAudio.paused) {
      if (!this.summaryAudioPrimed) this.primeSummaryAudio()

      // Play intro summary before starting episode (avoids overlap at t=0)
      const introIdx = this.processed.summaries.findIndex(
        (s, i) => !this.summaryPlayed[i] && s.timestamp === 0 && this.summaryBlobUrls[i] !== null,
      )
      if (introIdx !== -1) {
        this.pendingIntro = introIdx
      } else {
        // Safety: ensure volume is 1 in case it was left at 0 by a failed/interrupted fade
        this.episodeAudio.volume = 1
        this.episodeAudio.play().catch(() => {})
      }

      this.cb.onPlayStateChange(true)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
    } else {
      this.episodeAudio.pause()
      this.pendingIntro = null
      this.cb.onPlayStateChange(false)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    }
  }

  seek(to: number) {
    if (this.inSummary) {
      this.summaryInterrupted = true
      this.summaryAudio.pause()
      this.summaryAudio.dispatchEvent(new Event('ended'))
      this.inSummary = false
      this.cb.onSummaryEnd()
      this.episodeAudio.volume = 1
    }
    this.pendingIntro = null
    this.episodeAudio.currentTime = to
    this.summaryPlayed = this.processed.summaries.map((s) => s.timestamp < to)
  }

  skip(delta: number) {
    this.seek(Math.max(0, this.episodeAudio.currentTime + delta))
  }

  skipSummary() {
    if (!this.inSummary) return
    // Don't set summaryInterrupted — episode resumes after summary is skipped
    this.summaryAudio.pause()
    this.summaryAudio.dispatchEvent(new Event('ended'))
  }

  setSpeed(s: number) {
    this.episodeAudio.playbackRate = s
  }

  private setupMediaSession(meta: AudioEngineMeta) {
    if (!('mediaSession' in navigator)) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist,
      artwork: meta.artwork ? [{ src: meta.artwork, sizes: '100x100', type: 'image/jpeg' }] : [],
    })
    navigator.mediaSession.playbackState = 'paused'

    navigator.mediaSession.setActionHandler('play', () => {
      this.episodeAudio.volume = 1
      this.episodeAudio.play().catch(() => {})
      this.cb.onPlayStateChange(true)
      navigator.mediaSession.playbackState = 'playing'
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      if (this.inSummary) {
        this.summaryInterrupted = true
        this.summaryAudio.pause()
        this.summaryAudio.dispatchEvent(new Event('ended'))
      } else {
        this.episodeAudio.pause()
      }
      this.cb.onPlayStateChange(false)
      navigator.mediaSession.playbackState = 'paused'
    })
    navigator.mediaSession.setActionHandler('seekbackward', () => this.skip(-15))
    navigator.mediaSession.setActionHandler('seekforward', () => this.skip(15))
  }

  destroy() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.episodeAudio.pause()
    this.summaryAudio.pause()
    this.summaryBlobUrls.forEach((url) => { if (url) URL.revokeObjectURL(url) })
  }
}
