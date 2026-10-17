import { GuideTimeline, playSteps, replayLineStart, type GuideMoment, type Segment } from '@polycast/core'
import { plog } from '../lib/playbackLog'
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
  /** Whether the app is on screen. A question can't be answered on a locked phone, so it doesn't wait. */
  inForeground?: () => boolean
}

/** Trace of what the player does: Terminal in development, and the shareable playback log on a test phone. */
function trace(...args: unknown[]) {
  plog(...args)
}
const fmt = (s: number) => s.toFixed(2)

// Pacing of a handover (Finlay, 14 Oct): the guide shouldn't cut in or vanish. The host fades out,
// a short breath, the guide; then a breath, and the episode fades back in a couple of seconds
// earlier, so the learner hears the end of the last sentence again and knows where they are.
const FADE_OUT_MS = 450
const FADE_IN_MS = 900
const FADE_STEPS = 9
const BREATH_BEFORE_GUIDE_MS = 450
const BREATH_AFTER_GUIDE_MS = 500
/** How far back the episode picks up after the guide. */
export const PICK_UP_BEFORE_SEC = 2
/** Pauses around the host's clips, so a clip never runs straight into the guide's words. */
const GAP_BEFORE_CLIP_MS = 350
const GAP_AFTER_CLIP_MS = 450
const GAP_BETWEEN_LINES_MS = 120
/** A host clip starts a touch early and ends a touch late, so names and first syllables aren't cut. */
export const CLIP_LEAD_SEC = 0.15
export const CLIP_TAIL_SEC = 0.2
/** With the phone locked, a question is read, given a moment's thought, and the episode carries on. */
const LOCKED_QUESTION_PAUSE_MS = 3000
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
  private clipEnd: { start: number; at: number; started: boolean; done: () => void } | undefined
  /** Where to pick up after the guide, if the learner moved the playhead while it was speaking. */
  private resumeOverride: number | undefined
  private skipRequested = false
  private answerWaiter: ((index: number) => void) | undefined
  private lastSaved = 0
  /** Paused while the guide had the floor: the guide waits here until play. */
  private hold: { promise: Promise<void>; release: () => void; phase: 'guide' | 'question' } | undefined
  /** The guide's line (or host clip) in progress was cut short by a pause, so it plays again. */
  private interrupted = false

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
    this.lastSaved = startAt
    this.unsubscribe.push(this.o.audio.onProgress((p) => void this.onProgress(p)))
    this.unsubscribe.push(this.o.audio.onEnded(() => void this.onEnded()))
    this.set({ phase: 'playing', position: startAt })
    await this.o.audio.play()
    await this.onProgress(startAt)
  }

  private async onProgress(position: number) {
    if (this.clipEnd) {
      // Count the clip as playing only once the playhead has been seen inside it: the first update
      // after a seek can still carry the old position (often past the clip's end), which used to
      // cut the host off after a word.
      const c = this.clipEnd
      const wasStarted = c.started
      if (position >= c.start - 0.5 && position < c.at) c.started = true
      trace(`  clip tick pos=${fmt(position)} (clip ${fmt(c.start)}–${fmt(c.at)})${c.started ? '' : ' ignored: outside clip'}${c.started && !wasStarted ? ' started' : ''}`)
      if (c.started && position >= c.at - CLIP_TOLERANCE) this.endClip('reached end')
      return
    }
    if (this.state.phase !== 'playing') return
    this.set({ position })
    // Either direction: after jumping back from 30:00 to 5:00, the new place is saved straight away.
    if (Math.abs(position - this.lastSaved) >= 15) {
      this.lastSaved = position
      this.o.onSavePosition?.(position)
    }
    const due = this.timeline.tick(position)
    if (due.length > 0) await this.runMoments(due)
  }

  private async runMoments(due: GuideMoment[]) {
    const resumeAt = await this.o.audio.position()
    trace(`guide moment(s) ${due.map((m) => m.id).join(', ')} at pos=${fmt(resumeAt)}`)
    this.set({ phase: 'guide', moment: due[0] })
    await this.fade(1, 0, FADE_OUT_MS)
    await this.o.audio.pause()
    await this.sleep(BREATH_BEFORE_GUIDE_MS)

    for (const m of due) {
      await this.waitIfHeld()
      this.timeline.markPlayed(m.id)
      this.skipRequested = false
      this.set({ phase: 'guide', moment: m, answer: undefined })
      const steps = playSteps(m)
      for (let i = 0; i < steps.length; ) {
        const step = steps[i]!
        if (this.skipRequested) break
        const prev = steps[i - 1]
        if (prev) await this.sleep(step.kind === 'clip' ? GAP_BEFORE_CLIP_MS : prev.kind === 'clip' ? GAP_AFTER_CLIP_MS : GAP_BETWEEN_LINES_MS)
        await this.waitIfHeld()
        if (this.skipRequested) break
        this.interrupted = false
        if (step.kind === 'speech') {
          trace(`  guide speaks (${step.durationSec ? fmt(step.durationSec) + 's' : 'length unknown'})`)
          const said = Date.now()
          await this.o.voice.play(step.url)
          trace(`  guide finished after ${fmt((Date.now() - said) / 1000)}s`)
        } else await this.playClip(step.start, step.end)
        // Paused part-way: once the learner presses play, this line starts again from its beginning.
        if (this.interrupted) continue
        i++
      }
      if (m.waits && m.question && !this.skipRequested && this.o.inForeground && !this.o.inForeground()) {
        trace('  question asked with the phone locked: not waiting for an answer')
        await this.sleep(LOCKED_QUESTION_PAUSE_MS)
      } else if (m.waits && m.question && !this.skipRequested) {
        this.set({ phase: 'question', moment: m })
        const index = await new Promise<number>((resolve) => (this.answerWaiter = resolve))
        this.answerWaiter = undefined
        if (index >= 0) {
          // Answered while paused: show it, but stay paused so play still means play.
          this.set({ phase: this.hold ? 'paused' : 'question', moment: m, answer: { index, correct: index === m.question.answerIndex } })
          await this.sleep(1600) // long enough to see whether it was right
        }
      }
    }

    if (this.state.phase === 'finished') return
    // Paused during the guide (an answer can still arrive while paused): the episode waits for play.
    await this.waitIfHeld()
    // Where the learner moved the playhead wins; otherwise pick up a little before where we stopped
    // (not for the warm-up at the very start).
    const back = this.resumeOverride ?? (resumeAt > PICK_UP_BEFORE_SEC + 1 ? resumeAt - PICK_UP_BEFORE_SEC : resumeAt)
    this.resumeOverride = undefined
    if (!this.skipRequested) await this.sleep(BREATH_AFTER_GUIDE_MS)
    trace(`back to the episode at pos=${fmt(back)}`)
    await this.o.audio.seek(back)
    await this.o.audio.setVolume(0)
    this.set({ phase: 'playing', moment: undefined, answer: undefined, position: back })
    await this.o.audio.play()
    await this.fade(0, 1, FADE_IN_MS)
  }

  /** Plays the host saying something, from the episode itself, then pauses. */
  private async playClip(clipStart: number, clipEnd: number) {
    const start = Math.max(0, clipStart - CLIP_LEAD_SEC)
    const end = clipEnd + CLIP_TAIL_SEC
    trace(`  host clip ${fmt(start)}–${fmt(end)} (${fmt(end - start)}s): seeking`)
    const began = Date.now()
    await this.o.audio.seek(start)
    trace(`  host clip: seek done, player says pos=${fmt(await this.o.audio.position())}`)
    await this.o.audio.setVolume(1)
    const reached = new Promise<void>((done) => (this.clipEnd = { start, at: end, started: false, done }))
    // Never wait forever on the playhead: if progress updates stop, move on a little after the clip.
    const clip = this.clipEnd
    const guard = setTimeout(() => this.clipEnd === clip && this.endClip('gave up: no progress reached the end'), ((end - start) / (this.state.rate || 1) + 3) * 1000)
    await this.o.audio.play()
    await reached
    clearTimeout(guard)
    await this.o.audio.pause()
    trace(`  host clip done after ${fmt((Date.now() - began) / 1000)}s of ${fmt(end - start)}s, paused at pos=${fmt(await this.o.audio.position())}`)
  }

  private endClip(why = 'skipped') {
    const c = this.clipEnd
    this.clipEnd = undefined
    if (c) trace(`  host clip ends: ${why}`)
    c?.done()
  }

  /** An eased fade (slow at both ends), which sounds gentler than a straight line. */
  private async fade(from: number, to: number, ms: number) {
    for (let i = 1; i <= FADE_STEPS; i++) {
      const eased = 0.5 - 0.5 * Math.cos((Math.PI * i) / FADE_STEPS)
      await this.o.audio.setVolume(from + (to - from) * eased)
      await this.sleep(ms / FADE_STEPS)
    }
  }

  // ---------------------------------------------------------------- learner actions

  private async waitIfHeld(): Promise<void> {
    while (this.hold) await this.hold.promise
  }

  /** Skip whatever the guide is saying and go back to the episode (after play, if paused). */
  skipGuide(): void {
    if (this.state.phase !== 'guide' && this.state.phase !== 'question' && !this.hold) return
    this.skipRequested = true
    this.o.voice.stop()
    this.endClip()
    this.answerWaiter?.(-1)
  }

  answer(index: number): void {
    this.answerWaiter?.(index)
  }

  async pause(): Promise<void> {
    if ((this.state.phase === 'guide' || this.state.phase === 'question') && !this.hold) {
      // The guide stops mid-sentence and the episode holds; play picks up with the same moment.
      let release = () => {}
      const promise = new Promise<void>((r) => (release = r))
      this.hold = { promise, release, phase: this.state.phase }
      this.interrupted = true
      trace(`paused during the guide (${this.state.moment?.id ?? '?'})`)
      this.o.voice.stop()
      if (this.clipEnd) this.endClip('paused')
      await this.o.audio.pause()
      this.set({ phase: 'paused' })
      this.o.onSavePosition?.(this.state.position)
      return
    }
    if (this.state.phase !== 'playing') return
    await this.o.audio.pause()
    this.set({ phase: 'paused' })
    this.o.onSavePosition?.(this.state.position)
  }

  async resume(): Promise<void> {
    const held = this.hold
    if (held) {
      this.hold = undefined
      this.set({ phase: held.phase })
      held.release()
      return
    }
    if (this.state.phase !== 'paused') return
    this.set({ phase: 'playing' })
    await this.o.audio.play()
  }

  async seek(to: number): Promise<void> {
    if (this.state.phase === 'guide' || this.state.phase === 'question' || this.hold) {
      // The guide stops and the episode picks up where the learner moved it, not where it paused.
      this.resumeOverride = to
      this.skipGuide()
    }
    this.timeline.seek(to)
    await this.o.audio.seek(to)
    this.set({ position: to })
  }

  /** Back to the start of the line just heard. */
  async replayLine(): Promise<void> {
    const position = await this.o.audio.position()
    await this.seek(replayLineStart(this.o.segments, position))
  }

  /**
   * Hear one of the guide's moments again (the introduction, say), then carry on from the same
   * place in the episode. Does nothing while the guide is already speaking.
   */
  async replayMoment(m: GuideMoment): Promise<void> {
    if ((this.state.phase !== 'playing' && this.state.phase !== 'paused') || this.hold) return
    await this.runMoments([m])
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
      if (this.state.phase === 'guide' || this.state.phase === 'question' || this.hold) return this.skipGuide()
      return this.seek((await this.o.audio.position()) + 30)
    }
    return this.seek(cmd.seek)
  }

  private async onEnded() {
    const position = await this.o.audio.position()
    const due = this.timeline.tick(Number.POSITIVE_INFINITY).filter((m) => m.kind === 'wrapUp')
    if (due.length > 0 && this.state.phase === 'playing') {
      // A skip of an earlier moment is over by now; it mustn't silence the wrap-up.
      this.skipRequested = false
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
