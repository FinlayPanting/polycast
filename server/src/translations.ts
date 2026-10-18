import { createHash, randomUUID } from 'node:crypto'
import { checkTranslations, costUSD, translationPrompt, ZERO_USAGE, type Usage } from '@polycast/core'
import { SpendGuard } from './budget'
import type { Fetch } from './catalogue'
import { getSetting, pgSpendLedger, type Sql } from './db'
import { moodPool } from './mood'
import type { TextModel } from './providers/types'

/**
 * Shared translations of show and episode titles and descriptions (PC-1017-T1). Each text is
 * translated once per reading language and kept for everyone, so after the first learner it's free.
 * Calls go to Gemini Flash-Lite, reserved against the daily spending cap first and settled with what
 * they really cost; they don't count against anyone's allowance.
 */

/** Most texts in one call; a result list of titles fits easily. */
export const TRANSLATE_BATCH = 40
/** Longest text translated; descriptions are stored at up to about 1,000 characters. */
export const TRANSLATE_MAX_CHARS = 1000

export const translationHash = (text: string) => createHash('sha256').update(text.trim()).digest('hex')

/** Before a call: about a token per 3 characters in, the same again out, plus the instructions. */
function estimate(texts: string[]): Usage {
  const chars = texts.reduce((n, t) => n + t.length, 0)
  return { ...ZERO_USAGE, textInTokens: 300 + Math.ceil(chars / 3), textOutTokens: 100 + Math.ceil(chars / 2.5) }
}

/** Saved translations for these texts; missing ones are absent from the map. */
export async function savedTranslations(sql: Sql, texts: string[], readingLanguage: string): Promise<Map<string, string>> {
  const hashes = [...new Set(texts.map(translationHash))]
  if (hashes.length === 0) return new Map()
  const rows = await sql`select hash, translation from translations where reading_language = ${readingLanguage} and hash in ${sql(hashes)}`
  return new Map(rows.map((r) => [r.hash as string, r.translation as string]))
}

/**
 * Translations for `texts` in `readingLanguage`, in the same order: saved ones straight away, the
 * rest in calls of up to 40, saved for everyone. A text that couldn't be translated is null.
 */
export async function translateTexts(
  deps: { sql: Sql; text: TextModel; guard?: SpendGuard },
  texts: string[],
  readingLanguage: string,
): Promise<(string | null)[]> {
  const { sql } = deps
  const clean = texts.map((t) => t.replace(/\s+/g, ' ').trim().slice(0, TRANSLATE_MAX_CHARS))
  const saved = await savedTranslations(sql, clean.filter(Boolean), readingLanguage)
  const missing = [...new Set(clean.filter((t) => t && !saved.has(translationHash(t))))]
  if (missing.length) {
    const guard = deps.guard ?? new SpendGuard(pgSpendLedger(sql), Number(await getSetting(sql, 'daily_cap_usd', 10)))
    for (let i = 0; i < missing.length; i += TRANSLATE_BATCH) {
      const batch = missing.slice(i, i + TRANSLATE_BATCH)
      const ledgerId = `translate-${randomUUID()}`
      await guard.reserve(ledgerId, costUSD(estimate(batch)))
      let usage: Usage = ZERO_USAGE
      let reply: unknown
      try {
        const r = await deps.text.generateJson<unknown>(translationPrompt(batch, readingLanguage))
        usage = { ...ZERO_USAGE, ...r.usage }
        reply = r.data
      } finally {
        await guard.settle(ledgerId, usage)
      }
      const out = checkTranslations(reply, batch.length)
      const rows = batch.flatMap((t, k) => (out[k] ? [{ hash: translationHash(t), reading_language: readingLanguage, translation: out[k]! }] : []))
      for (const r of rows) saved.set(r.hash, r.translation)
      if (rows.length) await sql`insert into translations ${sql(rows)} on conflict (hash, reading_language) do nothing`
    }
  }
  return clean.map((t) => (t ? (saved.get(translationHash(t)) ?? null) : null))
}

/**
 * Translates the day's Discover pool (Polycast picks, prepared episodes and the charts, from the
 * daily cache) ahead of time, so the shows learners see first already have their translations.
 * Only what isn't saved yet is sent; on a normal day that's a handful of new chart entries.
 */
export async function pretranslateDiscover(
  deps: { sql: Sql; text: TextModel; fetch: Fetch; podcastIndex?: { key: string; secret: string }; guard?: SpendGuard },
  languages: readonly string[],
  readingLanguage = 'en',
): Promise<number> {
  let texts = 0
  for (const language of languages) {
    const { candidates } = await moodPool(deps.sql, deps.fetch, language, deps.podcastIndex)
    const all = candidates.flatMap((c) => [c.title, c.description ?? ''].filter(Boolean))
    await translateTexts(deps, all, readingLanguage)
    texts += all.length
  }
  return texts
}
