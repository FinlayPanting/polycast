import { describe, expect, it } from 'vitest'
import { onOwnKey, openKey, OwnKeyError, ownKeyError, plausibleKey, sealKey, testElevenLabsKey, testGeminiKey } from '../src/ownKeys'
import { ProviderError } from '../src/providers/types'

const SECRET = Buffer.alloc(32, 7).toString('base64')

describe('learners’ own API keys (PC-1017-K1)', () => {
  it('seals keys so the database never holds them in plain text', () => {
    const key = 'sk_live_1234567890abcdefghij'
    const sealed = sealKey(key, SECRET)
    expect(sealed).not.toContain(key)
    expect(sealKey(key, SECRET)).not.toBe(sealed) // a fresh nonce every time
    expect(openKey(sealed, SECRET)).toBe(key)
    expect(() => openKey(sealed, Buffer.alloc(32, 8).toString('base64'))).toThrow()
  })

  it('only takes something shaped like a key', () => {
    expect(plausibleKey('AIzaSyD-abcdefghijklmnopqrstuvwxyz012345')).toBe(true)
    expect(plausibleKey('short')).toBe(false)
    expect(plausibleKey('has spaces in it and is long enough')).toBe(false)
    expect(plausibleKey(undefined)).toBe(false)
  })

  it('tests each key with a tiny call and says plainly when it doesn’t work', async () => {
    const answer = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch
    expect(await testElevenLabsKey('k', answer(200))).toEqual({ ok: true })
    expect(await testElevenLabsKey('k', answer(401))).toMatchObject({ ok: false, message: expect.stringMatching(/can’t reach ElevenLabs/) })
    expect(await testGeminiKey('k', answer(400))).toMatchObject({ ok: false, message: expect.stringMatching(/can’t reach Google Gemini/) })
    expect(await testGeminiKey('k', answer(503))).toMatchObject({ ok: false, message: expect.stringMatching(/didn’t answer/) })
  })

  it('puts their provider’s errors in plain words, keeping whether to retry', async () => {
    let slowed = 0
    const text = onOwnKey('gemini', { generateJson: async () => { throw new ProviderError('quota', true, 429) } }, () => slowed++)
    const e = await text.generateJson().catch((x) => x)
    expect(e).toBeInstanceOf(OwnKeyError)
    expect(e.retryable).toBe(true)
    expect(e.message).toBe(ownKeyError('gemini', 429))
    expect(slowed).toBe(1)
    expect(ownKeyError('elevenlabs', 402)).toMatch(/out of credit/)
    expect(ownKeyError('elevenlabs', 401)).toMatch(/turned down/)
  })
})
