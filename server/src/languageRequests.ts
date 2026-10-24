import { requestableName, type RequestableLanguage } from '@polycast/core'
import type { Sql } from './db'

/** Counts one "Learning something else?" tap (PC-1023-02). Only the language is stored, per day. */
export async function countLanguageRequest(sql: Sql, language: RequestableLanguage): Promise<void> {
  await sql`insert into language_requests (language, requests) values (${language}, 1)
            on conflict (day, language) do update set requests = language_requests.requests + 1`
}

export interface LanguageRequestCount {
  language: string
  name: string
  requests: number
}

/** Requests in the week starting `weekStart` (YYYY-MM-DD), most asked-for first. */
export async function weeklyLanguageRequests(sql: Sql, weekStart: string): Promise<LanguageRequestCount[]> {
  const rows = await sql`
    select language, sum(requests)::int as n from language_requests
    where day >= ${weekStart}::date and day < ${weekStart}::date + 7
    group by language order by n desc, language`
  return rows.map((r) => ({ language: r.language, name: requestableName(r.language), requests: Number(r.n) }))
}

/** One plain line for the morning email, e.g. "Asked for other languages: Dutch 12, Japanese 7". */
export function languageRequestsText(counts: LanguageRequestCount[]): string {
  if (!counts.length) return 'Asked for other languages: none'
  return `Asked for other languages: ${counts.map((c) => `${c.name} ${c.requests}`).join(', ')}`
}
