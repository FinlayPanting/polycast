import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Status = { currentTime: number; didJustFinish: boolean }
const players: { url: unknown; options: Record<string, unknown>; emit: (s: Status) => void; paused: number; removed: boolean; played: boolean; seekedTo?: number }[] = []
vi.mock('expo-audio', () => ({
  createAudioPlayer: (url: unknown, options: Record<string, unknown>) => {
    let listener: ((s: Status) => void) | undefined
    const rec = { url, options, emit: (s: Status) => listener?.(s), paused: 0, removed: false, played: false, seekedTo: undefined as number | undefined }
    players.push(rec)
    return {
      addListener: (_: string, l: (s: Status) => void) => ((listener = l), { remove: () => (listener = undefined) }),
      seekTo: async (t: number) => {
        rec.seekedTo = t
      },
      play: () => {
        rec.played = true
      },
      pause: () => {
        rec.paused++
      },
      remove: () => {
        rec.removed = true
      },
    }
  },
}))

describe('host clips stop where the audio reaches the end (PC-1029-03)', () => {
  beforeEach(() => {
    players.length = 0
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('plays all three seconds even when the audio takes two seconds to load', async () => {
    const { playHostClip } = await import('./useHostClip')
    await playHostClip('https://cdn.example/ep.mp3', 120, 123)
    const p = players[0]!
    expect(p.seekedTo).toBe(120)
    expect(p.played).toBe(true)
    // Two seconds of buffering on a train: the old stopwatch would have cut the clip at 3.15 s after the tap.
    p.emit({ currentTime: 120, didJustFinish: false })
    vi.advanceTimersByTime(3_200)
    p.emit({ currentTime: 121.2, didJustFinish: false })
    expect(p.paused).toBe(0)
    p.emit({ currentTime: 123.1, didJustFinish: false })
    expect(p.paused).toBe(0)
    p.emit({ currentTime: 123.16, didJustFinish: false })
    expect(p.paused).toBe(1)
    expect(p.removed).toBe(true)
  })

  it('stops if the episode ends inside the clip, and gives up on a connection that never loads', async () => {
    const { playHostClip, CLIP_GIVE_UP_MS } = await import('./useHostClip')
    await playHostClip('https://cdn.example/ep.mp3', 10, 13)
    players[0]!.emit({ currentTime: 11, didJustFinish: true })
    expect(players[0]!.paused).toBe(1)

    await playHostClip('https://cdn.example/slow.mp3', 10, 13)
    vi.advanceTimersByTime(CLIP_GIVE_UP_MS + 2_999)
    expect(players[1]!.paused).toBe(0)
    vi.advanceTimersByTime(2)
    expect(players[1]!.removed).toBe(true)
  })

  it('updates often enough to stop near the end of a short clip, and stops only once', async () => {
    const { playHostClip } = await import('./useHostClip')
    const stop = await playHostClip('https://cdn.example/ep.mp3', 0, 1)
    expect(players[0]!.options.updateInterval).toBeLessThanOrEqual(100)
    stop()
    stop()
    players[0]!.emit({ currentTime: 5, didJustFinish: false })
    expect(players[0]!.paused).toBe(1)
  })

  it('reads the clip end from the audio position, with a small tail for the last word', async () => {
    const { clipReachedEnd } = await import('./useHostClip')
    expect(clipReachedEnd({ currentTime: 3, didJustFinish: false }, 3)).toBe(false)
    expect(clipReachedEnd({ currentTime: 3.15, didJustFinish: false }, 3)).toBe(true)
  })
})
