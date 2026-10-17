import { describe, expect, it } from 'vitest'
import { loadWelcome, playWelcome, welcomeText, welcomeUrl } from './welcome'

const manifest = {
  text: "Hi, I'm Mia. A word like [[fika]], a coffee break.",
  parts: [
    { url: 'https://x.supabase.co/a-0.m4a', durationSec: 2 },
    { url: 'https://x.supabase.co/a-1.m4a', durationSec: 1 },
  ],
}
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('welcome', () => {
  it('points at the same path the server stores it under', () => {
    expect(welcomeUrl('https://x.supabase.co', 'sv')).toBe('https://x.supabase.co/storage/v1/object/public/guide-audio/welcome/v2/en-sv/mia.json')
  })

  it('loads a voiced welcome and quietly gives nothing when it is missing or broken', async () => {
    expect(await loadWelcome('u', reply(200, manifest))).toEqual(manifest)
    expect(await loadWelcome('u', reply(404, {}))).toBeUndefined()
    expect(await loadWelcome('u', reply(200, { text: 'x', parts: [] }))).toBeUndefined()
    expect(await loadWelcome('u', reply(200, { text: 'x', parts: [{ url: 'http://insecure' }] }))).toBeUndefined()
    expect(await loadWelcome('u', (async () => { throw new TypeError('offline') }) as unknown as typeof fetch)).toBeUndefined()
  })

  it('plays every part in order, and stops when asked', async () => {
    const played: string[] = []
    let stop = false
    const voice = { play: async (u: string) => void played.push(u), stop() {} }
    expect(await playWelcome(voice, manifest, () => stop)).toBe(true)
    expect(played).toEqual(manifest.parts.map((p) => p.url))
    played.length = 0
    const stopping = { play: async (u: string) => ((stop = true), void played.push(u)), stop() {} }
    expect(await playWelcome(stopping, manifest, () => stop)).toBe(false)
    expect(played).toHaveLength(1)
  })

  it('picks out the target-language words for reading along', () => {
    expect(welcomeText(manifest.text)).toEqual([
      { text: "Hi, I'm Mia. A word like ", target: false },
      { text: 'fika', target: true },
      { text: ', a coffee break.', target: false },
    ])
  })
})
