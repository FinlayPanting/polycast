import { describe, expect, it, vi } from 'vitest'

const created: { url: string; options: Record<string, unknown> }[] = []
vi.mock('expo-audio', () => ({
  setAudioModeAsync: vi.fn(async () => {}),
  createAudioPlayer: (url: string, options: Record<string, unknown>) => {
    created.push({ url, options })
    let listener: ((s: { duration: number; didJustFinish: boolean }) => void) | undefined
    return {
      addListener: (_: string, l: typeof listener) => ((listener = l), { remove() {} }),
      play: () => setTimeout(() => listener?.({ duration: 1, didJustFinish: true }), 0),
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
})
