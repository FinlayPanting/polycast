import { describe, expect, it } from 'vitest'
import { goodbyeUrl, isNightOwl, loadGoodbye, pickFarewell } from './goodbye'

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
const manifest = { version: 1, text: 'Ha det gott!', meaning: 'Take care!', url: 'https://x.supabase.co/goodbye/v1/sv/mia.m4a', durationSec: 1 }

describe('goodbye', () => {
  it('points at the same path the server stores it under', () => {
    expect(goodbyeUrl('https://x.supabase.co', 'sv', 'leo')).toBe('https://x.supabase.co/storage/v1/object/public/guide-audio/goodbye/v2/sv/leo.json')
  })

  it('loads a voiced goodbye and quietly gives nothing when it is missing or broken', async () => {
    expect(await loadGoodbye('u', reply(200, manifest))).toEqual({ text: 'Ha det gott!', meaning: 'Take care!', url: manifest.url })
    expect(await loadGoodbye('u', reply(404, {}))).toBeUndefined()
    expect(await loadGoodbye('u', reply(200, { ...manifest, url: 'http://insecure' }))).toBeUndefined()
    expect(await loadGoodbye('u', (async () => { throw new TypeError('offline') }) as unknown as typeof fetch)).toBeUndefined()
  })

  it('says goodnight from 11 pm to 4 am, if the goodnight is voiced (PC-1025-06)', () => {
    expect(goodbyeUrl('https://x.supabase.co', 'it', 'mia', true)).toBe('https://x.supabase.co/storage/v1/object/public/guide-audio/goodbye/v2/it/mia-night.json')
    const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m)
    expect([at(22, 59), at(23), at(0, 30), at(3, 59), at(4), at(12)].map(isNightOwl)).toEqual([false, true, true, true, false, false])
    const goodbye = { text: 'Ciao, a presto!', meaning: 'Bye, see you soon!', url: 'https://a' }
    const goodnight = { text: 'Sogni d’oro!', meaning: 'Sweet dreams! (golden dreams)', url: 'https://b' }
    expect(pickFarewell({ goodbye, goodnight }, at(23, 30))).toBe(goodnight)
    expect(pickFarewell({ goodbye, goodnight }, at(21))).toBe(goodbye)
    expect(pickFarewell({ goodbye }, at(23, 30))).toBe(goodbye)
    expect(pickFarewell({}, at(23, 30))).toBeUndefined()
  })
})
