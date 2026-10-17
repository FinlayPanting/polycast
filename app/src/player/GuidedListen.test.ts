import type { GuideMoment, Segment } from '@polycast/core'
import { describe, expect, it } from 'vitest'
import { GuidedListen, type ListenState } from './GuidedListen'
import type { EpisodeAudio, GuideVoice } from './types'

/** A pretend episode: `advance` moves the playhead while playing, as the real player's progress events would. */
function fakeAudio() {
  let pos = 0
  let playing = false
  let volume = 1
  const progress = new Set<(s: number) => void>()
  const ended = new Set<() => void>()
  const log: string[] = []
  const audio: EpisodeAudio & { advance: (sec: number, step?: number) => Promise<void>; end: () => Promise<void>; log: string[]; get pos(): number; get volume(): number; get playing(): boolean } = {
    log,
    get pos() { return pos },
    get volume() { return volume },
    get playing() { return playing },
    async load(_t, startAt = 0) { pos = startAt },
    async play() { playing = true; log.push(`play@${pos.toFixed(1)}`) },
    async pause() { playing = false; log.push(`pause@${pos.toFixed(1)}`) },
    async seek(s) { pos = s; log.push(`seek ${s.toFixed(1)}`) },
    async position() { return pos },
    async setVolume(v) { volume = v },
    async setRate() {},
    onProgress(l) { progress.add(l); return () => progress.delete(l) },
    onEnded(l) { ended.add(l); return () => ended.delete(l) },
    async unload() {},
    async advance(sec, step = 0.25) {
      for (let t = 0; t < sec; t += step) {
        if (playing) pos += step
        for (const l of progress) l(pos)
        await flush()
      }
    },
    async end() { for (const l of ended) l(); await flush() },
  }
  return audio
}

const flush = async () => {
  for (let i = 0; i < 400; i++) await Promise.resolve()
}

function fakeVoice() {
  const played: string[] = []
  let finish: (() => void) | undefined
  const voice: GuideVoice & { played: string[]; finishCurrent: () => Promise<void> } = {
    played,
    play(url) {
      played.push(url)
      return new Promise<void>((r) => (finish = r))
    },
    stop() { finish?.() },
    async finishCurrent() { finish?.(); await flush() },
  }
  return voice
}

const segments: Segment[] = [0, 5, 10, 15, 20, 25].map((start, i) => ({ id: `s${i}`, start, end: start + 4.5, text: '', wordStart: 0, wordEnd: 0 }))

const spotlight: GuideMoment = {
  id: 'spot',
  kind: 'spotlight',
  at: 10,
  minLevel: 'standard',
  script: 'Listen {clip:0} again',
  clips: [{ start: 6, end: 7 }],
  audio: { parts: [{ kind: 'speech', url: 'guide-1.m4a', durationSec: 1 }, { kind: 'clip', clipIndex: 0 }, { kind: 'speech', url: 'guide-2.m4a', durationSec: 1 }], durationSec: 3 },
}
const question: GuideMoment = {
  id: 'q',
  kind: 'quickQuestion',
  at: 20,
  minLevel: 'handsOn',
  script: 'Was it late?',
  clips: [],
  waits: true,
  question: { prompt: 'Was it late?', options: ['Yes', 'No'], answerIndex: 0 },
  audio: { parts: [{ kind: 'speech', url: 'q.m4a', durationSec: 1 }], durationSec: 1 },
}

function setup(moments: GuideMoment[]) {
  const audio = fakeAudio()
  const voice = fakeVoice()
  const states: ListenState[] = []
  const listen = new GuidedListen({ audio, voice, moments, segments, sleep: async () => {}, onChange: (s) => states.push(s) })
  return { audio, voice, listen, states }
}

const track = { url: 'https://cdn/ep.mp3', title: 'Tåget', artist: 'Svenska Samtal', durationSec: 30 }

describe('a guided listen', () => {
  it('pauses at the moment, plays guide speech and the host clip in order, then resumes where it left off', async () => {
    const { audio, voice, listen } = setup([spotlight])
    await listen.start(track)
    await audio.advance(10)
    expect(listen.current.phase).toBe('guide')
    expect(audio.playing).toBe(false)
    expect(voice.played).toEqual(['guide-1.m4a'])

    await voice.finishCurrent() // first speech done → host clip plays from the episode
    // A touch early, so the host's first syllable isn't cut.
    expect(audio.log.some((l) => /^seek 5\.[89]$/.test(l))).toBe(true)
    expect(audio.playing).toBe(true)
    await audio.advance(1.5) // clip reaches its end, plus a short tail
    expect(voice.played).toEqual(['guide-1.m4a', 'guide-2.m4a'])

    await voice.finishCurrent()
    expect(listen.current.phase).toBe('playing')
    // Picks up a couple of seconds early, so the learner hears the end of the sentence again.
    expect(audio.log.at(-2)).toBe('seek 8.0')
    expect(audio.playing).toBe(true)
    expect(audio.volume).toBe(1)

    await audio.advance(5) // the moment never repeats
    expect(voice.played).toHaveLength(2)
  })

  it('pauses the guide mid-sentence and picks up the same moment on play', async () => {
    const { audio, voice, listen } = setup([spotlight])
    await listen.start(track)
    await audio.advance(10)
    expect(voice.played).toEqual(['guide-1.m4a'])
    await listen.pause()
    await flush()
    expect(listen.current.phase).toBe('paused')
    expect(audio.playing).toBe(false)
    await audio.advance(5) // time passes; nothing carries on while paused
    expect(voice.played).toEqual(['guide-1.m4a'])
    expect(audio.playing).toBe(false)

    await listen.resume()
    await flush()
    expect(listen.current.phase).toBe('guide')
    // The interrupted line starts again, then the moment carries on as usual.
    expect(voice.played).toEqual(['guide-1.m4a', 'guide-1.m4a'])
    await voice.finishCurrent()
    expect(audio.playing).toBe(true) // the host clip
    await audio.advance(1.5)
    await voice.finishCurrent()
    expect(voice.played).toEqual(['guide-1.m4a', 'guide-1.m4a', 'guide-2.m4a'])
    expect(listen.current.phase).toBe('playing')
    expect(audio.log.at(-2)).toBe('seek 8.0')
  })

  it('pausing during the host clip holds it, and play hears the clip again', async () => {
    const { audio, voice, listen } = setup([spotlight])
    await listen.start(track)
    await audio.advance(10)
    await voice.finishCurrent() // host clip starts
    expect(audio.playing).toBe(true)
    await audio.advance(0.5)
    await listen.remote('pause') // headphones
    await flush()
    expect(listen.current.phase).toBe('paused')
    expect(audio.playing).toBe(false)
    await audio.advance(3)
    expect(voice.played).toEqual(['guide-1.m4a'])
    await listen.remote('play')
    await flush()
    expect(audio.playing).toBe(true)
    expect(audio.log.filter((l) => /^seek 5\.[89]$/.test(l))).toHaveLength(2)
    await audio.advance(1.5)
    expect(voice.played).toEqual(['guide-1.m4a', 'guide-2.m4a'])
  })

  it('holds a waiting question while paused, and an answer given then waits for play', async () => {
    const { audio, voice, listen } = setup([question])
    await listen.start(track)
    await audio.advance(20)
    await voice.finishCurrent()
    expect(listen.current.phase).toBe('question')
    await listen.pause()
    expect(listen.current.phase).toBe('paused')
    listen.answer(0)
    await flush()
    expect(listen.current.answer?.correct).toBe(true) // the answer shows
    expect(listen.current.phase).toBe('paused') // but it stays paused until play
    expect(audio.playing).toBe(false)
    await listen.resume()
    await flush()
    expect(listen.current.phase).toBe('playing')
    expect(audio.playing).toBe(true)
  })

  it('moving the playhead while paused in the guide skips it and picks up there on play', async () => {
    const { audio, voice, listen } = setup([spotlight])
    await listen.start(track)
    await audio.advance(10)
    await listen.pause()
    await listen.seek(15)
    await flush()
    expect(audio.playing).toBe(false)
    await listen.resume()
    await flush()
    expect(voice.played).toEqual(['guide-1.m4a'])
    expect(listen.current.phase).toBe('playing')
    expect(audio.pos).toBe(15)
  })

  it('skips the guide on request and goes straight back to the episode', async () => {
    const { audio, voice, listen } = setup([spotlight])
    await listen.start(track)
    await audio.advance(10)
    listen.skipGuide()
    await flush()
    expect(voice.played).toEqual(['guide-1.m4a'])
    expect(listen.current.phase).toBe('playing')
    expect(audio.pos).toBe(8)
  })

  it('waits for an answer on a Hands-on question, then shows whether it was right', async () => {
    const { audio, voice, listen, states } = setup([question])
    await listen.start(track)
    await audio.advance(20)
    await voice.finishCurrent()
    expect(listen.current.phase).toBe('question')
    await audio.advance(3) // time passes; nothing moves on without an answer
    expect(listen.current.phase).toBe('question')
    listen.answer(0)
    await flush()
    expect(states.some((s) => s.answer?.correct === true)).toBe(true)
    expect(listen.current.phase).toBe('playing')
  })

  it('treats headphone "back" as replay the line, and "forward" as skip the guide', async () => {
    const { audio, voice, listen } = setup([spotlight])
    await listen.start(track)
    await audio.advance(8)
    await listen.remote('previous')
    expect(audio.pos).toBe(5)

    await audio.advance(6)
    expect(listen.current.phase).toBe('guide')
    await listen.remote('next')
    await flush()
    expect(listen.current.phase).toBe('playing')
    expect(voice.played).toEqual(['guide-1.m4a'])
  })

  it('passes over moments when the learner scrubs past them, and replays them after scrubbing back', async () => {
    const { audio, voice, listen } = setup([spotlight])
    await listen.start(track)
    await listen.seek(15)
    await audio.advance(2)
    expect(voice.played).toEqual([])
    await listen.seek(8)
    await audio.advance(2.5)
    expect(voice.played).toEqual(['guide-1.m4a'])
  })

  it('picks up where the learner left off without replaying earlier moments', async () => {
    const { audio, voice, listen } = setup([spotlight])
    await listen.start(track, 12)
    await audio.advance(1)
    expect(voice.played).toEqual([])
    expect(listen.current.position).toBeGreaterThanOrEqual(12)
  })

  it('finishes when the episode ends', async () => {
    const { audio, listen } = setup([])
    await listen.start(track)
    await audio.advance(1)
    await audio.end()
    expect(listen.current.phase).toBe('finished')
  })
})

describe('hearing a moment again', () => {
  it('replays the introduction on request, then carries on from about the same place', async () => {
    const intro: GuideMoment = { ...spotlight, id: 'intro', kind: 'warmup', at: 0, script: 'Welcome', clips: [], audio: { parts: [{ kind: 'speech', url: 'intro.m4a', durationSec: 1 }], durationSec: 1 } }
    const { audio, voice, listen } = setup([intro])
    const started = listen.start(track) // the introduction plays straight away
    await flush()
    await voice.finishCurrent()
    await started
    await audio.advance(4)
    expect(voice.played).toEqual(['intro.m4a'])

    const replay = listen.replayMoment(intro)
    await flush()
    expect(listen.current.phase).toBe('guide')
    await voice.finishCurrent()
    await replay
    expect(voice.played).toEqual(['intro.m4a', 'intro.m4a'])
    expect(listen.current.phase).toBe('playing')
    expect(audio.pos).toBe(2) // the same place, picked up a couple of seconds early
  })
})

describe('host clips and moving the playhead', () => {
  it('ignores a stale position from before the seek, so the host isn\'t cut off after a word', async () => {
    const { audio, voice, listen } = setup([spotlight])
    await listen.start(track)
    await audio.advance(10)
    await voice.finishCurrent() // the clip starts: seek to 6
    // The player's next update still says 10 (where it was before the seek): past the clip's end.
    ;(listen as any).onProgress(10)
    await flush()
    expect(voice.played).toEqual(['guide-1.m4a']) // still in the clip
    await audio.advance(1.5)
    expect(voice.played).toEqual(['guide-1.m4a', 'guide-2.m4a'])
  })

  it('picks up where the learner scrubbed to if they move the playhead while the guide speaks', async () => {
    const { audio, listen } = setup([spotlight])
    await listen.start(track)
    await audio.advance(10)
    await listen.seek(25)
    await flush()
    expect(listen.current.phase).toBe('playing')
    expect(audio.pos).toBe(25)
  })
})

describe('questions and the lock screen', () => {
  it("doesn't wait for an answer while the phone is locked: reads the question and carries on", async () => {
    const audio = fakeAudio()
    const voice = fakeVoice()
    const listen = new GuidedListen({ audio, voice, moments: [question], segments, sleep: async () => {}, inForeground: () => false })
    await listen.start(track)
    await audio.advance(20)
    expect(voice.played).toEqual(['q.m4a'])
    await voice.finishCurrent()
    expect(listen.current.phase).toBe('playing')
    expect(audio.playing).toBe(true)
  })
})

describe('saving progress and the wrap-up', () => {
  const wrapUp: GuideMoment = {
    id: 'wrap',
    kind: 'wrapUp',
    at: 30,
    minLevel: 'light',
    script: 'That was the episode.',
    clips: [],
    audio: { parts: [{ kind: 'speech', url: 'wrap.m4a', durationSec: 1 }], durationSec: 1 },
  }

  it('saves the new place soon after the learner jumps backwards', async () => {
    const audio = fakeAudio()
    const saved: number[] = []
    const listen = new GuidedListen({ audio, voice: fakeVoice(), moments: [], segments, sleep: async () => {}, onSavePosition: (s) => saved.push(s) })
    await listen.start(track, 1800)
    await audio.advance(16)
    expect(saved.at(-1)).toBeGreaterThanOrEqual(1815)
    await listen.seek(300)
    await audio.advance(0.5)
    expect(saved.at(-1)).toBeLessThan(310)
  })

  it('still plays the wrap-up after the learner skipped the last moment', async () => {
    const audio = fakeAudio()
    const voice = fakeVoice()
    const listen = new GuidedListen({ audio, voice, moments: [spotlight, wrapUp], segments, sleep: async () => {} })
    await listen.start(track)
    await audio.advance(10)
    listen.skipGuide()
    await flush()
    expect(listen.current.phase).toBe('playing')
    await audio.end()
    expect(voice.played).toContain('wrap.m4a')
    await voice.finishCurrent()
    expect(listen.current.phase).toBe('finished')
  })
})
