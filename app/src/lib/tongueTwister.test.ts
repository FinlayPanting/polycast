import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

type Status = { didJustFinish: boolean }
const log: string[] = []
let emit: (s: Status) => void = () => {}
vi.mock('expo-audio', () => ({
  createAudioPlayer: (url: string) => {
    log.push(`load ${url}`)
    return {
      addListener: (_: string, l: (s: Status) => void) => ((emit = l), { remove: () => log.push('unlisten') }),
      setPlaybackRate: (r: number, q?: string) => log.push(`rate ${r} ${q}`),
      seekTo: async (t: number) => void log.push(`seek ${t}`),
      play: () => log.push('play'),
      pause: () => log.push('pause'),
      remove: () => log.push('remove'),
    }
  },
}))

describe('a tongue-twister for the curious (PC-1029-08)', () => {
  it('reads the twister voiced beside the goodbye', async () => {
    const { twisterUrl } = await import('./tongueTwister')
    expect(twisterUrl('https://x.supabase.co', 'sv', 'leo')).toBe('https://x.supabase.co/storage/v1/object/public/guide-audio/goodbye/v2/sv/leo-twister.json')
  })

  it('plays it slowly first, then at full speed, then lets go', async () => {
    const { playTwister } = await import('./tongueTwister')
    log.length = 0
    const { done } = playTwister('https://cdn.example/mia-twister.m4a')
    expect(log).toEqual(['load https://cdn.example/mia-twister.m4a', 'rate 0.7 high', 'play'])
    emit({ didJustFinish: true })
    await new Promise((r) => setTimeout(r, 0))
    expect(log.slice(3)).toEqual(['rate 1 high', 'seek 0', 'play'])
    emit({ didJustFinish: true })
    await done
    expect(log.slice(-3)).toEqual(['unlisten', 'pause', 'remove'])
  })

  it('is hidden on the wrap-up: a long press on the guide’s mark, never announced', () => {
    const screen = readFileSync(join(__dirname, '..', 'app/listen/[id].tsx'), 'utf8')
    const wrapUp = screen.slice(screen.indexOf('function WrapUp('), screen.indexOf('export default function Listen'))
    expect(wrapUp).toMatch(/onLongPress=\{[^}]*twister/)
    expect(wrapUp).toContain('twisterOffer(')
    const changelog = readFileSync(join(__dirname, '../../../server/changelog.json'), 'utf8')
    expect(changelog).not.toContain('PC-1029-08')
  })
})
