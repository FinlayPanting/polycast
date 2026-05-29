import type { ProcessedEpisode } from './storage'
import { base64ToArrayBuffer } from './tts'

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
  private gainNode: GainNode
  private summaryBuffers: (AudioBuffer | null)[] = []
  private processed: ProcessedEpisode
  private cb: AudioEngineCallbacks
  private summaryPlayed: boolean[]
  private summarySource: AudioBufferSourceNode | null = null
  private inSummary = false
  private tickInterval: ReturnType<typeof setInterval> | null = null

  constructor(processed: ProcessedEpisode, cb: AudioEngineCallbacks) {
    this.processed = processed
    this.cb = cb
    this.summaryPlayed = new Array(processed.summaries.length).fill(false)

    this.ctx = new AudioContext()
    this.gainNode = this.ctx.createGain()
    this.gainNode.connect(this.ctx.destination)

    this.audio = new Audio()
    this.audio.preload = 'auto'
    const blob = new Blob([base64ToArrayBuffer(processed.episodeAudioBase64)], { type: 'audio/mpeg' })
    this.audio.src = URL.createObjectURL(blob)

    // Route episode audio through gain node for fade control
    const mediaSource = this.ctx.createMediaElementSource(this.audio)
    mediaSource.connect(this.gainNode)

    this.audio.addEventListener('durationchange', () => cb.onDurationChange(this.audio.duration))
    this.audio.addEventListener('ended', () => cb.onPlayStateChange(false))

    this.decodeSummaries()
    this.tickInterval = setInterval(() => this.tick(), 250)
    this.setupMediaSession()
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
    this.inSummary = true
    this.summaryPlayed[idx] = true

    // Fade out episode audio, then pause
    await this.fade(1, 0, FADE_MS)
    this.audio.pause()
    this.gainNode.gain.setValueAtTime(1, this.ctx.currentTime) // reset for later

    this.cb.onSummaryStart(idx)

    if (this.ctx.state === 'suspended') await this.ctx.resume()

    const source = this.ctx.createBufferSource()
    source.buffer = this.summaryBuffers[idx]!
    source.connect(this.ctx.destination) // bypass gain node so summary is always at full vol
    source.start()
    this.summarySource = source

    source.addEventListener('ended', () => {
      this.inSummary = false
      this.summarySource = null
      this.cb.onSummaryEnd()
      // Fade episode back in
      this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime)
      this.audio.play().catch(() => {})
      this.cb.onPlayStateChange(true)
      this.fade(0, 1, FADE_MS)
    })
  }

  private fade(from: number, to: number, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const now = this.ctx.currentTime
      this.gainNode.gain.setValueAtTime(from, now)
      this.gainNode.gain.linearRampToValueAtTime(to, now + ms / 1000)
      setTimeout(resolve, ms)
    })
  }

  togglePlay() {
    if (this.inSummary) return
    if (this.ctx.state === 'suspended') this.ctx.resume()
    if (this.audio.paused) {
      this.audio.play().catch(() => {})
      this.cb.onPlayStateChange(true)
    } else {
      this.audio.pause()
      this.cb.onPlayStateChange(false)
    }
  }

  seek(to: number) {
    if (this.inSummary) {
      this.summarySource?.stop()
      this.summarySource = null
      this.inSummary = false
      this.cb.onSummaryEnd()
      this.gainNode.gain.setValueAtTime(1, this.ctx.currentTime)
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

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => this.togglePlay())
    navigator.mediaSession.setActionHandler('pause', () => this.togglePlay())
    navigator.mediaSession.setActionHandler('seekbackward', () => this.skip(-15))
    navigator.mediaSession.setActionHandler('seekforward', () => this.skip(15))
  }

  destroy() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.summarySource?.stop()
    this.audio.pause()
    URL.revokeObjectURL(this.audio.src)
    this.ctx.close()
  }
}
