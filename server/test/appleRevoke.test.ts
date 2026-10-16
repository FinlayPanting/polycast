import { generateKeyPairSync } from 'node:crypto'
import { decodeJwt, decodeProtectedHeader } from 'jose'
import { describe, expect, it } from 'vitest'
import { appleClientSecret, appleRevoker } from '../src/appleRevoke'

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const key = { teamId: 'TEAM123', keyId: 'KEY456', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), clientId: 'app.polycast' }

describe('Sign in with Apple revocation', () => {
  it('signs the client secret Apple expects', async () => {
    const jwt = await appleClientSecret(key, 1_800_000_000)
    expect(decodeProtectedHeader(jwt)).toMatchObject({ alg: 'ES256', kid: 'KEY456' })
    expect(decodeJwt(jwt)).toMatchObject({ iss: 'TEAM123', sub: 'app.polycast', aud: 'https://appleid.apple.com', exp: 1_800_000_300 })
  })

  it('exchanges the code and revokes the refresh token', async () => {
    const calls: { url: string; body: URLSearchParams }[] = []
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: new URLSearchParams(String(init.body)) })
      return url.endsWith('/auth/token') ? Response.json({ refresh_token: 'r-1', access_token: 'a-1' }) : new Response('')
    }) as any
    expect(await appleRevoker(key, f)('code-abc')).toBe(true)
    expect(calls.map((c) => c.url)).toEqual(['https://appleid.apple.com/auth/token', 'https://appleid.apple.com/auth/revoke'])
    expect(calls[0]!.body.get('code')).toBe('code-abc')
    expect(calls[1]!.body.get('token')).toBe('r-1')
    expect(calls[1]!.body.get('token_type_hint')).toBe('refresh_token')
  })

  it('reports failure instead of throwing when Apple refuses', async () => {
    const f = (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as any
    expect(await appleRevoker(key, f)('stale')).toBe(false)
  })
})
