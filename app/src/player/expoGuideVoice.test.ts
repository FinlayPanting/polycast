import { describe, expect, it, vi } from 'vitest'

const created: { url: string; options: Record<string, unknown> }[] = []
const modeCalls = vi.hoisted(() => vi.fn(async (_: Record<string, unknown>) => {}))
vi.mock('expo-audio', () => ({
  setAudioModeAsync: modeCalls,
  createAudioPlayer: (url: string, options: Record<string, unknown>) => {
    created.push({ url, options })
    let listener: ((s: { duration: number; currentTime: number; didJustFinish: boolean }) => void) | undefined
    return {
      addListener: (_: string, l: typeof listener) => ((listener = l), { remove() {} }),
      volume: 1,
      muted: false,
      play: () => setTimeout(() => listener?.({ duration: 1, currentTime: 1, didJustFinish: true }), 0),
      pause() {},
      remove() {},
    }
  },
}))

describe('expoGuideVoice', () => {
  it('keeps the audio session on after the guide stops, so the episode player is not silenced', async () => {
    const { expoGuideVoice } = await import('./expoGuideVoice')
    await expoGuideVoice().play('https://example.com/mia.mp3')
    expect(created[0]?.options.keepAudioSessionActive).toBe(true)
  })

  it('sets up the audio session exactly as the episode player does, once', async () => {
    const { expoGuideVoice, prepareGuideAudio } = await import('./expoGuideVoice')
    await prepareGuideAudio()
    await expoGuideVoice().play('https://example.com/leo.mp3')
    expect(modeCalls).toHaveBeenCalledTimes(1)
    // Track Player uses playback with no mixing; anything else makes iOS switch and mute playback.
    expect(modeCalls.mock.calls[0]![0]).toMatchObject({ interruptionMode: 'doNotMix', playsInSilentMode: true })
  })
})
