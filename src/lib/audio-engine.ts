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
  private audio: HTMLAudioElement
  private episodeUrl: string
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
    this.episodeUrl = processed.enclosureUrl
    this.summaryPlayed = new Array(processed.summaries.length).fill(false)

    // Pre-build blob URLs for all summary clips so they can play via <audio> in background
    this.summaryBlobUrls = processed.summaries.map((s) => {
      try {
        const buf = base64ToArrayBuffer(s.audioBase64)
        const blob = new Blob([buf], { type: 'audio/mpeg' })
        return URL.createObjectURL(blob)
      } catch {
        return null
      }
    })

    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.src = this.episodeUrl

    if (initialPosition > 0) {
      this.audio.addEventListener('loadedmetadata', () => {
        this.audio.currentTime = initialPosition
        this.summaryPlayed = this.processed.summaries.map((s) => s.timestamp < initialPosition)
      }, { once: true })
    }

    this.audio.addEventListener('durationchange', () => {
      if (!this.inSummary) cb.onDurationChange(this.audio.duration)
    })
    this.audio.addEventListener('ended', () => {
      if (!this.inSummary) {
        cb.onPlayStateChange(false)
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
      }
    })

    this.tickInterval = setInterval(() => this.tick(), 250)
    this.setupMediaSession(meta)
  }

  private tick() {
    if (this.inSummary || this.audio.paused) {
      if (!this.inSummary) this.cb.onTimeUpdate(this.audio.currentTime)
      return
    }
    const t = this.audio.currentTime
    this.cb.onTimeUpdate(t)

    const idx = this.processed.summaries.findIndex(
      (s, i) => !this.summaryPlayed[i] && t >= s.timestamp && t < s.timestamp + 1,
    )
    if (idx !== -1 && this.summaryBlobUrls[idx]) {
      this.playSummary(idx)
    }
  }

  private async playSummary(idx: number) {
    if (this.inSummary) return
    this.inSummary = true
    this.summaryPlayed[idx] = true

    const summaryUrl = this.summaryBlobUrls[idx]!
    const resumeAt = this.audio.currentTime

    // Fade out episode, then swap src to summary — same audio element, same iOS audio session
    await this.fadeVolume(1, 0, FADE_MS)
    this.cb.onSummaryStart(idx)

    this.audio.src = summaryUrl
    this.audio.volume = 1

    try {
      await this.audio.play()
      await new Promise<void>((resolve) => {
        const done = () => resolve()
        this.audio.addEventListener('ended', done, { once: true })
        this.audio.addEventListener('error', done, { once: true })
      })
    } catch { /* failed to play — continue to restore */ }

    // Restore episode src and seek to where we left off
    this.audio.src = this.episodeUrl
    this.audio.volume = 0
    this.cb.onSummaryEnd()

    await new Promise<void>((resolve) => {
      if (this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        this.audio.currentTime = resumeAt
        resolve()
      } else {
        this.audio.addEventListener('loadedmetadata', () => {
          this.audio.currentTime = resumeAt
          resolve()
        }, { once: true })
      }
    })

    await this.audio.play().catch(() => {})
    this.cb.onPlayStateChange(true)
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
    this.fadeVolume(0, 1, FADE_MS)

    this.inSummary = false
  }

  private fadeVolume(from: number, to: number, ms: number): Promise<void> {
    const steps = 16
    const dt = ms / steps
    const dv = (to - from) / steps
    let v = from
    this.audio.volume = v
    return new Promise((resolve) => {
      const tick = () => {
        v += dv
        this.audio.volume = Math.max(0, Math.min(1, v))
        if ((dv > 0 && v >= to) || (dv <= 0 && v <= to)) {
          this.audio.volume = to
          resolve()
          return
        }
        setTimeout(tick, dt)
      }
      setTimeout(tick, dt)
    })
  }

  togglePlay() {
    if (this.inSummary) return
    if (this.audio.paused) {
      this.audio.play().catch(() => {})
      this.cb.onPlayStateChange(true)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
    } else {
      this.audio.pause()
      this.cb.onPlayStateChange(false)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    }
  }

  seek(to: number) {
    if (this.inSummary) {
      // Interrupt summary: restore episode src immediately
      this.audio.src = this.episodeUrl
      this.audio.volume = 1
      this.inSummary = false
      this.cb.onSummaryEnd()
    }
    this.audio.currentTime = to
    this.summaryPlayed = this.processed.summaries.map((s) => s.timestamp < to)
  }

  skip(delta: number) {
    this.seek(Math.max(0, this.audio.currentTime + delta))
  }

  setSpeed(s: number) {
    this.audio.playbackRate = s
  }

  private setupMediaSession(meta: AudioEngineMeta) {
    if (!('mediaSession' in navigator)) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist,
      artwork: meta.artwork
        ? [{ src: meta.artwork, sizes: '100x100', type: 'image/jpeg' }]
        : [],
    })
    navigator.mediaSession.playbackState = 'paused'

    navigator.mediaSession.setActionHandler('play', () => {
      this.audio.play().catch(() => {})
      this.cb.onPlayStateChange(true)
      navigator.mediaSession.playbackState = 'playing'
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      this.audio.pause()
      this.cb.onPlayStateChange(false)
      navigator.mediaSession.playbackState = 'paused'
    })
    navigator.mediaSession.setActionHandler('seekbackward', () => this.skip(-15))
    navigator.mediaSession.setActionHandler('seekforward', () => this.skip(15))
  }

  destroy() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.audio.pause()
    this.summaryBlobUrls.forEach((url) => { if (url) URL.revokeObjectURL(url) })
  }
}
