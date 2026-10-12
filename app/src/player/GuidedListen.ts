import { GuideTimeline, playSteps, replayLineStart, type GuideMoment, type Segment } from '@polycast/core'
import type { EpisodeAudio, GuideVoice, RemoteCommand } from './types'

export type Phase = 'loading' | 'playing' | 'paused' | 'guide' | 'question' | 'finished'

export interface ListenState {
  phase: Phase
  position: number
  /** The moment the guide is speaking, or the question waiting for an answer. */
  moment?: GuideMoment
  /** Set after the learner answers a quick question. */
  answer?: { index: number; correct: boolean }
  next?: GuideMoment
  rate: number
}

export interface ListenOptions {
  audio: EpisodeAudio
  voice: GuideVoice
  moments: GuideMoment[]
  segments: Segment[]
  sleep?: (ms: number) => Promise<void>
  onChange?: (state: ListenState) => void
  /** Called every so often with the position, to save where the learner left off. */
  onSavePosition?: (seconds: number) => void
}

const FADE_MS = 350
const FADE_STEPS = 7
/** A clip of the host is done when the playhead reaches its end, give or take one progress update. */
const CLIP_TOLERANCE = 0.05

/**
 * Runs a guided listen: plays the episode, and at each due moment fades it out, lets the guide speak
 * with the host's own clips in between, then picks up exactly where it left off. Hands-on questions
 * wait for an answer. Nothing is generated here; it only plays the lesson plan.
 */
export class GuidedListen {
  private readonly timeline: GuideTimeline
  private state: ListenState = { phase: 'loading', position: 0, rate: 1 }
  private readonly sleep: (ms: number) => Promise<void>
  private unsubscribe: (() => void)[] = []
  private clipEnd: { at: number; done: () => void } | undefined
  private skipRequested = false
  private answerWaiter: ((index: number) => void) | undefined
  private lastSaved = 0

  constructor(private readonly o: ListenOptions) {
    this.timeline = new GuideTimeline(o.moments)
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  get current(): ListenState {
    return this.state
  }

  private set(patch: Partial<ListenState>) {
    this.state = { ...this.state, ...patch, next: this.timeline.next(patch.position ?? this.state.position) }
    this.o.onChange?.(this.state)
  }

  async start(track: Parameters<EpisodeAudio['load']>[0], startAt = 0): Promise<void> {
    await this.o.audio.load(track, startAt)
    if (startAt > 0) this.timeline.seek(startAt)
    this.unsubscribe.push(this.o.audio.onProgress((p) => void this.onProgress(p)))
    this.unsubscribe.push(this.o.audio.onEnded(() => void this.onEnded()))
    this.set({ phase: 'playing', position: startAt })
    await this.o.audio.play()
    await this.onProgress(startAt)
  }

  private async onProgress(position: number) {
    if (this.clipEnd && position >= this.clipEnd.at - CLIP_TOLERANCE) {
      const done = this.clipEnd.done
      this.clipEnd = undefined
      done()
      return
    }
    if (this.state.phase !== 'playing') return
    this.set({ position })
    if (position - this.lastSaved >= 15) {
      this.lastSaved = position
      this.o.onSavePosition?.(position)
    }
    const due = this.timeline.tick(position)
    if (due.length > 0) await this.runMoments(due)
  }

  private async runMoments(due: GuideMoment[]) {
    const resumeAt = await this.o.audio.position()
    this.set({ phase: 'guide', moment: due[0] })
    await this.fade(1, 0)
    await this.o.audio.pause()

    for (const m of due) {
      this.timeline.markPlayed(m.id)
      this.skipRequested = false
      this.set({ phase: 'guide', moment: m, answer: undefined })
      for (const step of playSteps(m)) {
        if (this.skipRequested) break
        if (step.kind === 'speech') await this.o.voice.play(step.url)
        else await this.playClip(step.start, step.end)
      }
      if (m.waits && m.question && !this.skipRequested) {
        this.set({ phase: 'question', moment: m })
        const index = await new Promise<number>((resolve) => (this.answerWaiter = resolve))
        this.answerWaiter = undefined
        if (index >= 0) {
          this.set({ phase: 'question', moment: m, answer: { index, correct: index === m.question.answerIndex } })
          await this.sleep(1600) // long enough to see whether it was right
        }
      }
    }

    if (this.state.phase === 'finished') return
    await this.o.audio.seek(resumeAt)
    await this.o.audio.setVolume(0)
    this.set({ phase: 'playing', moment: undefined, answer: undefined, position: resumeAt })
    await this.o.audio.play()
    await this.fade(0, 1)
  }

  /** Plays the host saying something, from the episode itself, then pauses. */
  private async playClip(start: number, end: number) {
    await this.o.audio.seek(start)
    await this.o.audio.setVolume(1)
    const reached = new Promise<void>((done) => (this.clipEnd = { at: end, done }))
    await this.o.audio.play()
    await reached
    await this.o.audio.pause()
  }

  private async fade(from: number, to: number) {
    for (let i = 1; i <= FADE_STEPS; i++) {
      await this.o.audio.setVolume(from + ((to - from) * i) / FADE_STEPS)
      await this.sleep(FADE_MS / FADE_STEPS)
    }
  }

  // ---------------------------------------------------------------- learner actions

  /** Skip whatever the guide is saying and go back to the episode. */
  skipGuide(): void {
    if (this.state.phase !== 'guide' && this.state.phase !== 'question') return
    this.skipRequested = true
    this.o.voice.stop()
    if (this.clipEnd) {
      const done = this.clipEnd.done
      this.clipEnd = undefined
      done()
    }
    this.answerWaiter?.(-1)
  }

  answer(index: number): void {
    this.answerWaiter?.(index)
  }

  async pause(): Promise<void> {
    if (this.state.phase !== 'playing') return
    await this.o.audio.pause()
    this.set({ phase: 'paused' })
    this.o.onSavePosition?.(this.state.position)
  }

  async resume(): Promise<void> {
    if (this.state.phase !== 'paused') return
    this.set({ phase: 'playing' })
    await this.o.audio.play()
  }

  async seek(to: number): Promise<void> {
    if (this.state.phase === 'guide' || this.state.phase === 'question') this.skipGuide()
    this.timeline.seek(to)
    await this.o.audio.seek(to)
    this.set({ position: to })
  }

  /** Back to the start of the line just heard. */
  async replayLine(): Promise<void> {
    const position = await this.o.audio.position()
    await this.seek(replayLineStart(this.o.segments, position))
  }

  async setRate(rate: number): Promise<void> {
    await this.o.audio.setRate(rate)
    this.set({ rate })
  }

  /** Headphones and lock screen: back replays the last line, forward skips the guide (spec: Tutor mode). */
  async remote(cmd: RemoteCommand): Promise<void> {
    if (cmd === 'play') return this.resume()
    if (cmd === 'pause') return this.pause()
    if (cmd === 'previous') return this.replayLine()
    if (cmd === 'next') {
      if (this.state.phase === 'guide' || this.state.phase === 'question') return this.skipGuide()
      return this.seek((await this.o.audio.position()) + 30)
    }
    return this.seek(cmd.seek)
  }

  private async onEnded() {
    const position = await this.o.audio.position()
    const due = this.timeline.tick(Number.POSITIVE_INFINITY).filter((m) => m.kind === 'wrapUp')
    if (due.length > 0 && this.state.phase === 'playing') {
      this.set({ phase: 'guide', moment: due[0], position })
      this.timeline.markPlayed(due[0]!.id)
      for (const step of playSteps(due[0]!)) if (step.kind === 'speech' && !this.skipRequested) await this.o.voice.play(step.url)
    }
    this.set({ phase: 'finished', moment: undefined, position })
    this.o.onSavePosition?.(position)
  }

  async dispose(): Promise<void> {
    this.unsubscribe.forEach((u) => u())
    this.unsubscribe = []
    this.o.voice.stop()
    await this.o.audio.unload()
  }
}
