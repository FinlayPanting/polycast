/**
 * Lets go of a learner's Sign in with Apple link when they delete their account, as Apple's
 * account-deletion rules ask. The app sends a fresh authorisation code from Apple; the server
 * exchanges it for a token and revokes that token. Needs a Sign in with Apple key (.p8) from the
 * Apple Developer account, kept in Railway: APPLE_TEAM_ID, APPLE_SIGNIN_KEY_ID, APPLE_SIGNIN_KEY
 * and APPLE_CLIENT_ID (the app's bundle id).
 */
import { importPKCS8, SignJWT } from 'jose'
import type { Fetch } from './catalogue'

export interface AppleSignInKey {
  teamId: string
  keyId: string
  /** The .p8 file's contents (PKCS#8 PEM). */
  privateKey: string
  clientId: string
}

export type RevokeApple = (authorizationCode: string) => Promise<boolean>

const APPLE = 'https://appleid.apple.com'

/** The short-lived client secret Apple asks for: a JWT signed with the Sign in with Apple key. */
export async function appleClientSecret(key: AppleSignInKey, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const pk = await importPKCS8(key.privateKey.replace(/\\n/g, '\n'), 'ES256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: key.keyId })
    .setIssuer(key.teamId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 300)
    .setAudience(APPLE)
    .setSubject(key.clientId)
    .sign(pk)
}

/** Exchanges the code for a refresh token and revokes it. Returns false (never throws) if Apple says no. */
export function appleRevoker(key: AppleSignInKey, f: Fetch = fetch): RevokeApple {
  return async (code) => {
    try {
      const secret = await appleClientSecret(key)
      const form = (fields: Record<string, string>) => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: key.clientId, client_secret: secret, ...fields }).toString(),
        signal: AbortSignal.timeout(10_000),
      })
      const tokenRes = await f(`${APPLE}/auth/token`, form({ grant_type: 'authorization_code', code }))
      if (!tokenRes.ok) return false
      const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string }
      const token = tokens.refresh_token ?? tokens.access_token
      if (!token) return false
      const revoked = await f(`${APPLE}/auth/revoke`, form({ token, token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token' }))
      return revoked.ok
    } catch (e) {
      console.error('Apple revoke failed', e)
      return false
    }
  }
}
