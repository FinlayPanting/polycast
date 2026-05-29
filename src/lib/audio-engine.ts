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
  private ctx: AudioContext
  private summaryBuffers: (AudioBuffer | null)[] = []
  private processed: ProcessedEpisode
  private cb: AudioEngineCallbacks
  private summaryPlayed: boolean[]
  private summarySource: AudioBufferSourceNode | null = null
  private inSummary = false
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private onVisibilityChange: () => void

  constructor(
    processed: ProcessedEpisode,
    meta: AudioEngineMeta,
    cb: AudioEngineCallbacks,
    initialPosition = 0,
  ) {
    this.processed = processed
    this.cb = cb
    this.summaryPlayed = new Array(processed.summaries.length).fill(false)

    this.ctx = new AudioContext()

    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.src = processed.enclosureUrl

    if (initialPosition > 0) {
      this.audio.addEventListener('loadedmetadata', () => {
        this.audio.currentTime = initialPosition
        this.summaryPlayed = this.processed.summaries.map((s) => s.timestamp < initialPosition)
      }, { once: true })
    }

    this.audio.addEventListener('durationchange', () => cb.onDurationChange(this.audio.duration))
    this.audio.addEventListener('ended', () => {
      cb.onPlayStateChange(false)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    })

    // Resume AudioContext when screen unlocks so future summaries can play
    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange)

    this.decodeSummaries()
    this.tickInterval = setInterval(() => this.tick(), 250)
    this.setupMediaSession(meta)
  }

  private async decodeSummaries() {
    this.summaryBuffers = await Promise.all(
      this.processed.summaries.map(async (s) => {
        try {
          return await this.ctx.decodeAudioData(base64ToArrayBuffer(s.audioBase64))
        } catch {
          return null
        }
      }),
    )
  }

  private tick() {
    if (this.inSummary) return
    const t = this.audio.currentTime
    this.cb.onTimeUpdate(t)

    const idx = this.processed.summaries.findIndex(
      (s, i) => !this.summaryPlayed[i] && t >= s.timestamp && t < s.timestamp + 1,
    )
    if (idx !== -1 && this.summaryBuffers[idx]) {
      this.playSummary(idx)
    }
  }

  private async playSummary(idx: number) {
    if (this.inSummary) return

    // Screen is locked — AudioContext can't resume without user gesture, skip gracefully
    if (document.visibilityState === 'hidden') {
      this.summaryPlayed[idx] = true
      return
    }

    this.inSummary = true
    this.summaryPlayed[idx] = true

    await this.fadeVolume(1, 0, FADE_MS)
    this.audio.pause()
    this.audio.volume = 1

    this.cb.onSummaryStart(idx)

    if (this.ctx.state === 'suspended') await this.ctx.resume()

    const source = this.ctx.createBufferSource()
    source.buffer = this.summaryBuffers[idx]!
    source.connect(this.ctx.destination)
    source.start()
    this.summarySource = source

    source.addEventListener('ended', () => {
      this.inSummary = false
      this.summarySource = null
      this.cb.onSummaryEnd()
      this.audio.volume = 0
      this.audio.play().catch(() => {})
      this.cb.onPlayStateChange(true)
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
      this.fadeVolume(0, 1, FADE_MS)
    })
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
      this.summarySource?.stop()
      this.summarySource = null
      this.inSummary = false
      this.cb.onSummaryEnd()
      this.audio.volume = 1
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
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.summarySource?.stop()
    this.audio.pause()
    this.ctx.close()
  }
}
