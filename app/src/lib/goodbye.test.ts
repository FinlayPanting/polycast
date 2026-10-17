import { describe, expect, it } from 'vitest'
import { goodbyeUrl, loadGoodbye } from './goodbye'

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
})
