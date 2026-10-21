import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { ProviderError } from './providers/types'
import type { Sql } from './db'
import type postgres from 'postgres'

/**
 * "Use your own API keys" (PC-1017-K1). A learner's ElevenLabs key (transcription and the guide's
 * voice) and Google Gemini key (lesson plans, primers, translations) can prepare their episodes
 * instead of Polycast's keys and the Plus allowance. The app keeps the keys in the iPhone Keychain
 * and sends them over HTTPS with each preparation; the server keeps them encrypted only while that
 * job runs (so a retried job still works), never logs them, and deletes them when the job ends or
 * the learner removes their keys. Their provider's errors are shown in plain words and never fall
 * back to Polycast's keys. Episodes prepared this way join the shared pool like any other.
 */

export interface OwnKeys {
  elevenlabs: string
  gemini: string
}

/** Fair use: Railway, storage and audio downloads still cost Polycast, so a generous daily cap. */
export const OWN_KEYS_LIMITS = { preparationsPerDay: 10 }

export const OWN_KEYS_MESSAGES = {
  off: 'Using your own keys isn’t available just now. Plus still works as usual.',
  missing: 'Add both keys first: ElevenLabs and Google.',
  fairUse: 'That’s ten episodes on your own keys today. Try again tomorrow.',
}

/** Looks like a key at all: no spaces, a sensible length. The real check is a call to the provider. */
export function plausibleKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9_\-.]{20,200}$/.test(key)
}

function secretKey(secret: string): Buffer {
  const k = Buffer.from(secret, 'base64')
  if (k.length !== 32) throw new Error('OWN_KEYS_SECRET must be 32 bytes, base64')
  return k
}

/** Encrypts a key for the database: AES-256-GCM, "iv.tag.ciphertext" in base64. */
export function sealKey(plain: string, secret: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', secretKey(secret), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64')).join('.')
}

export function openKey(sealed: string, secret: string): string {
  const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64'))
  const d = createDecipheriv('aes-256-gcm', secretKey(secret), iv!)
  d.setAuthTag(tag!)
  return Buffer.concat([d.update(body!), d.final()]).toString('utf8')
}

export async function storeJobKeys(sql: Sql | postgres.TransactionSql, jobId: string, userId: string, keys: OwnKeys, secret: string): Promise<void> {
  await sql`insert into job_keys (job_id, user_id, elevenlabs, gemini) values (${jobId}, ${userId}, ${sealKey(keys.elevenlabs, secret)}, ${sealKey(keys.gemini, secret)})
            on conflict (job_id) do update set elevenlabs = excluded.elevenlabs, gemini = excluded.gemini`
}

export async function loadJobKeys(sql: Sql, jobId: string, secret: string): Promise<OwnKeys | undefined> {
  const [row] = await sql`select elevenlabs, gemini from job_keys where job_id = ${jobId}`
  return row ? { elevenlabs: openKey(row.elevenlabs, secret), gemini: openKey(row.gemini, secret) } : undefined
}

export async function deleteJobKeys(sql: Sql, jobId: string): Promise<void> {
  await sql`delete from job_keys where job_id = ${jobId}`
}

/** The learner removed their keys: forget every copy the server holds. Jobs still waiting can't run on them any more. */
export async function forgetUserKeys(sql: Sql, userId: string): Promise<number> {
  const rows = await sql`delete from job_keys where user_id = ${userId} returning job_id`
  return rows.length
}

export type KeyCheck = { ok: true } | { ok: false; message: string }

/** A tiny call with each key, so the learner hears straight away whether it works. */
export async function testElevenLabsKey(key: string, f: typeof fetch = fetch): Promise<KeyCheck> {
  try {
    const res = await f('https://api.elevenlabs.io/v1/models', { headers: { 'xi-api-key': key } })
    if (res.ok) return { ok: true }
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'This key can’t reach ElevenLabs. Check you copied all of it, and that it can use Speech to Text and Text to Speech.' }
    return { ok: false, message: 'ElevenLabs didn’t answer just now. Try again in a moment.' }
  } catch {
    return { ok: false, message: 'ElevenLabs didn’t answer just now. Try again in a moment.' }
  }
}

export async function testGeminiKey(key: string, f: typeof fetch = fetch): Promise<KeyCheck> {
  try {
    const res = await f(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1`, { headers: { 'x-goog-api-key': key } })
    if (res.ok) return { ok: true }
    if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, message: 'This key can’t reach Google Gemini. Check you copied all of it, from Google AI Studio.' }
    return { ok: false, message: 'Google didn’t answer just now. Try again in a moment.' }
  } catch {
    return { ok: false, message: 'Google didn’t answer just now. Try again in a moment.' }
  }
}

/** Their provider's error in plain words, for the learner. Never charged to Polycast as a fallback. */
export function ownKeyError(provider: 'elevenlabs' | 'gemini', status: number | undefined): string {
  const name = provider === 'elevenlabs' ? 'ElevenLabs' : 'Google'
  if (status === 401 || status === 403) return `Your ${name} key was turned down. Check it in You → Settings → Your own API keys.`
  if (status === 402) return `Your ${name} account is out of credit. Top it up, then try again.`
  if (status === 429) return `Your ${name} key hit its limit. Try again later, or add billing to your ${name} account.`
  return `Your ${name} key couldn’t prepare this episode just now. Nothing was charged to Polycast. Try again later.`
}

/** A provider error from the learner's own key, remembering whose it was. */
export class OwnKeyError extends ProviderError {
  constructor(
    readonly provider: 'elevenlabs' | 'gemini',
    cause: ProviderError,
  ) {
    super(ownKeyError(provider, cause.status), cause.retryable, cause.status)
    this.name = 'ProviderError'
  }
}

/**
 * Wraps a provider built on a learner's key so its errors say whose key it was, and so a rate
 * limit (a free Google key's 5 a minute) can tell the learner why it's slow while it retries.
 */
export function onOwnKey<T extends object>(provider: 'elevenlabs' | 'gemini', impl: T, onRateLimited?: () => void): T {
  return new Proxy(impl, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver)
      if (typeof v !== 'function') return v
      return async (...args: unknown[]) => {
        try {
          return await v.apply(target, args)
        } catch (e) {
          if (e instanceof ProviderError) {
            if (e.status === 429) onRateLimited?.()
            throw e instanceof OwnKeyError ? e : new OwnKeyError(provider, e)
          }
          throw e
        }
      }
    },
  })
}
