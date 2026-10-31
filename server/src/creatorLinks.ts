import { interleaveCharts, itunesSearchUrl, learnWithShowLink, parseItunesResults, showNotesLine, TOP_CHART_COUNTRIES, validAppleId, type PodcastSummary } from '@polycast/core'
import type { Sql } from './db'
import { keepShowsInLanguage, type Fetch, type NetOpts } from './catalogue'

/**
 * 'Learn with this show' (PC-1030-07): the creators page's search. A host types their show's name and picks
 * its language; Apple's catalogue is searched in that language's chart countries, and only shows whose feed
 * is in the language are offered (the same check Discover uses), each with its polycast.app link and
 * show-notes line. Public and free (no AI), so it is rate limited per address.
 */

export const CREATOR_LINK_LIMITS = { perAddressPerHour: 30, overallPerHour: 600, maxChars: 100, results: 5 }

export interface CreatorShow {
  appleId: string
  title: string
  author: string
  artwork: string
  link: string
  line: string
}

export async function findShowsForLinks(sql: Sql, f: Fetch, query: string, language: string, net: NetOpts = {}): Promise<CreatorShow[]> {
  const countries = TOP_CHART_COUNTRIES[language] ?? []
  const lists = await Promise.all(
    countries.map(async (country) => {
      const res = await f(itunesSearchUrl(query, country, 10)).catch(() => undefined)
      return res?.ok ? parseItunesResults(await res.json()) : []
    }),
  )
  const candidates: PodcastSummary[] = interleaveCharts(lists).filter((s) => validAppleId(s.appleId)).slice(0, 10)
  const kept = await keepShowsInLanguage(sql, f, candidates, language, net)
  return kept.slice(0, CREATOR_LINK_LIMITS.results).map((s) => {
    const link = learnWithShowLink(s.appleId)
    return { appleId: s.appleId, title: s.title, author: s.author, artwork: s.artwork, link, line: showNotesLine(language, link) }
  })
}
