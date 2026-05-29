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
  private tickInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    processed: ProcessedEpisode,
    meta: AudioEngineMeta,
    cb: AudioEngineCallbacks,
    initialPosition = 0,
  ) {
    this.processed = processed
    this.cb = cb
    this.summaryPlayed = new Array(processed.summaries.length).fill(false)

    // Pre-build blob URLs so summaryAudio can change src without new fetches
    this.summaryBlobUrls = processed.summaries.map((s) => {
      try {
        return URL.createObjectURL(new Blob([base64ToArrayBuffer(s.audioBase64)], { type: 'audio/mpeg' }))
      } catch {
        return null
      }
    })

    // Episode audio — src never changes, position is always preserved
    this.episodeAudio = new Audio()
    this.episodeAudio.preload = 'auto'
    this.episodeAudio.src = processed.enclosureUrl

    if (initialPosition > 0) {
      this.episodeAudio.addEventListener('loadedmetadata', () => {
        this.episodeAudio.currentTime = initialPosition
        this.summaryPlayed = processed.summaries.map((s) => s.timestamp < initialPosition)
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

    // Summary audio — kept as a separate element so episode position is never lost
    this.summaryAudio = new Audio()
    this.summaryAudio.preload = 'none'

    this.tickInterval = setInterval(() => this.tick(), 250)
    this.setupMediaSession(meta)
  }

  // Called once during first togglePlay() user gesture to let iOS allow background playback
  private primeSummaryAudio() {
    const url = this.summaryBlobUrls.find((u) => u !== null)
    if (!url) return
    this.summaryAudio.volume = 0
    this.summaryAudio.src = url
    this.summaryAudio.play()
      .then(() => { this.summaryAudio.pause(); this.summaryAudioPrimed = true })
      .catch(() => {})
  }

  private tick() {
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
      this.summaryPlayed[idx] = true // not primed yet, skip gracefully
    }
  }

  private async playSummary(idx: number) {
    if (this.inSummary) return
    this.inSummary = true
    this.summaryPlayed[idx] = true

    const locked = document.visibilityState === 'hidden'

    // Fade out episode (skip fade if screen is locked — setTimeout won't run)
    if (!locked) {
      await this.fadeVolume(this.episodeAudio, 1, 0, FADE_MS)
    } else {
      this.episodeAudio.volume = 0
    }
    this.episodeAudio.pause()
    this.cb.onSummaryStart(idx)

    // Play summary via its own primed audio element
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

    // Resume episode — position is exactly where we left it (src was never changed)
    this.episodeAudio.volume = 0
    this.episodeAudio.play().catch(() => {})
    this.cb.onSummaryEnd()
    this.cb.onPlayStateChange(true)
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'

    if (!locked) {
      this.fadeVolume(this.episodeAudio, 0, 1, FADE_MS)
    } else {
      this.episodeAudio.volume = 1
    }

    this.inSummary = false
  }

  private fadeVolume(el: HTMLAudioElement, from: number, to: number, ms: number): Promise<void> {
    const steps = 16
    const dt = ms / steps
    const dv = (to - from) / steps
    let v = from
    el.volume = v
    return new Promise((resolve) => {
      const tick = () => {
        v += dv
        el.volume = Math.max(0, Math.min(1, v))
        if ((dv > 0 && v >= to) || (dv <= 0 && v <= to)) { el.volume = to; resolve(); return }
        setTimeout(tick, dt)
      }
      setTimeout(tick, dt)
    })
  }

  togglePlay() {
    if (this.inSummary) return
    if (this.episodeAudio.paused) {
      this.episodeAudio.play().catch(() => {})
      if (!this.summaryAudioPrimed) this.primeSummaryAudio()
      this.cb.onPlayStateChange(true)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
    } else {
      this.episodeAudio.pause()
      this.cb.onPlayStateChange(false)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    }
  }

  seek(to: number) {
    if (this.inSummary) {
      this.summaryAudio.pause()
      this.inSummary = false
      this.cb.onSummaryEnd()
      this.episodeAudio.volume = 1
    }
    this.episodeAudio.currentTime = to
    this.summaryPlayed = this.processed.summaries.map((s) => s.timestamp < to)
  }

  skip(delta: number) {
    this.seek(Math.max(0, this.episodeAudio.currentTime + delta))
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
      this.episodeAudio.play().catch(() => {})
      this.cb.onPlayStateChange(true)
      navigator.mediaSession.playbackState = 'playing'
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      this.episodeAudio.pause()
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
