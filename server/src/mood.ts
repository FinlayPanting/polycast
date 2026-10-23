import { randomUUID } from 'node:crypto'
import { checkMoodPicks, costUSD, DISCOVER_CATEGORIES, moodKey, moodPrompt, prefilterCandidates, ZERO_USAGE, type MoodCandidate, type Usage } from '@polycast/core'
import { SpendGuard } from './budget'
import { categoryChart, topChart, type Fetch, type NetOpts } from './catalogue'
import { getSetting, pgSpendLedger, type Sql } from './db'
import type { TextModel } from './providers/types'

/** What the app shows for each pick: enough to open the show or episode, and the reason. */
export type MoodResult =
  | { kind: 'show'; title: string; author: string | null; artwork: string | null; podcastId?: string; appleId?: string; feedUrl?: string; why: string }
  | { kind: 'episode'; episodeId: string; podcastId: string; title: string; podcastTitle: string; artwork: string | null; why: string }

type Opener = Omit<Extract<MoodResult, { kind: 'show' }>, 'why'> | Omit<Extract<MoodResult, { kind: 'episode' }>, 'why'>

/** Repeated moods are free for a day. */
const MOOD_CACHE_HOURS = 24
/** Before the call: generous for ~40 short candidates and three lines back. */
const ESTIMATE: Usage = { ...ZERO_USAGE, textInTokens: 6000, textOutTokens: 400 }

/**
 * The mood pool for a language: Polycast picks, prepared episodes (their lesson plan's summary and
 * hosts say what each is about), then the top chart and category charts. Charts come from the
 * daily cache Discover already keeps, descriptions included, so building the pool costs nothing.
 */
export async function moodPool(sql: Sql, f: Fetch, language: string, podcastIndex?: { key: string; secret: string }, net: NetOpts = {}): Promise<{ candidates: MoodCandidate[]; open: Map<string, Opener> }> {
  const candidates: MoodCandidate[] = []
  const open = new Map<string, Opener>()
  const seen = new Set<string>()
  const addShow = (key: string, c: Omit<MoodCandidate, 'id' | 'kind'>, o: Opener, feedUrl?: string) => {
    const dedupe = (feedUrl ?? key).toLowerCase()
    if (seen.has(dedupe) || seen.has(c.title.toLowerCase())) return
    seen.add(dedupe)
    seen.add(c.title.toLowerCase())
    const id = `show:${key}`
    candidates.push({ id, kind: 'show', ...c })
    open.set(id, o)
  }

  const picks = await sql`
    select p.id, p.title, p.author, p.artwork, p.feed_url, p.description from picks k join podcasts p on p.id = k.podcast_id
    where k.language = ${language} and not p.removed order by k.position`
  for (const p of picks) addShow(p.id, { title: p.title, author: p.author ?? undefined, description: p.description ?? undefined, tags: ['Polycast pick'] }, { kind: 'show', title: p.title, author: p.author, artwork: p.artwork, podcastId: p.id }, p.feed_url)

  const ready = await sql`
    select e.id, e.podcast_id, e.title, coalesce(e.image, p.artwork) as image, e.description, p.title as podcast_title,
      (select l.plan->>'summary' from lesson_plans l where l.episode_id = e.id limit 1) as summary
    from episodes e join podcasts p on p.id = e.podcast_id
    where e.status = 'ready' and e.language = ${language} and not p.removed
    order by e.ready_at desc limit 30`
  for (const e of ready) {
    const id = `episode:${e.id}`
    candidates.push({ id, kind: 'episode', title: e.title, podcastTitle: e.podcast_title, description: (e.summary || e.description || undefined) ?? undefined, tags: ['prepared with the guide'] })
    open.set(id, { kind: 'episode', episodeId: e.id, podcastId: e.podcast_id, title: e.title, podcastTitle: e.podcast_title, artwork: e.image })
  }

  const [top, ...categories] = await Promise.all([
    topChart(sql, f, language, net).catch(() => []),
    ...DISCOVER_CATEGORIES.map((c) => categoryChart(sql, f, language, c, podcastIndex).catch(() => [])),
  ])
  for (const s of top) addShow(`a${s.appleId}`, { title: s.title, author: s.author, description: s.description, tags: s.genres }, { kind: 'show', title: s.title, author: s.author, artwork: s.artwork, appleId: s.appleId }, s.feedUrl)
  categories.forEach((list, i) => {
    for (const s of list) addShow(`p${s.podcastIndexId}`, { title: s.title, author: s.author, description: s.description, tags: [DISCOVER_CATEGORIES[i]!, ...s.categories] }, { kind: 'show', title: s.title, author: s.author, artwork: s.artwork, feedUrl: s.feedUrl }, s.feedUrl)
  })
  return { candidates, open }
}

export class MoodUnavailable extends Error {}

/** Where a mood's answer is cached: per target language, mood words and the language the reasons are in. */
const cacheChart = (language: string, mood: string, nativeLanguage: string) => `mood:${nativeLanguage}:${moodKey(language, mood)}`

/** A cached answer for this mood, if one was made in the last day. */
export async function cachedMood(sql: Sql, language: string, mood: string, nativeLanguage = 'en'): Promise<MoodResult[] | undefined> {
  const [row] = await sql`select items, fetched_at from chart_cache where language = ${language} and chart = ${cacheChart(language, mood, nativeLanguage)}`
  if (!row || Date.now() - new Date(row.fetched_at).getTime() >= MOOD_CACHE_HOURS * 3600_000) return undefined
  return row.items as MoodResult[]
}

/**
 * Three picks for a mood: the pool, the keyword pre-filter down to about 40, then one small Gemini
 * call, reserved against the daily spending cap first and settled with what it really cost.
 * The answer is cached for a day so the same mood is free next time.
 */
export async function recommendByMood(
  deps: { sql: Sql; fetch: Fetch; text: TextModel; podcastIndex?: { key: string; secret: string }; guard?: SpendGuard; lookupHost?: NetOpts['lookupHost'] },
  language: string,
  mood: string,
  nativeLanguage = 'en',
): Promise<MoodResult[]> {
  const { sql } = deps
  const { candidates, open } = await moodPool(sql, deps.fetch, language, deps.podcastIndex, { lookupHost: deps.lookupHost })
  if (candidates.length === 0) return []
  const shortlist = prefilterCandidates(mood, candidates)
  const guard = deps.guard ?? new SpendGuard(pgSpendLedger(sql), Number(await getSetting(sql, 'daily_cap_usd', 10)))
  const ledgerId = `mood-${randomUUID()}`
  await guard.reserve(ledgerId, costUSD(ESTIMATE))
  let usage: Usage = ZERO_USAGE
  let reply: unknown
  try {
    const r = await deps.text.generateJson<unknown>(moodPrompt(mood, shortlist, language, nativeLanguage))
    usage = { ...ZERO_USAGE, ...r.usage }
    reply = r.data
  } finally {
    await guard.settle(ledgerId, usage)
  }
  const results: MoodResult[] = checkMoodPicks(reply, shortlist).map((p) => ({ ...open.get(p.id)!, why: p.why }) as MoodResult)
  if (results.length === 0) throw new MoodUnavailable('No picks came back')
  await sql`insert into chart_cache (language, chart, items) values (${language}, ${cacheChart(language, mood, nativeLanguage)}, ${sql.json(results as any)})
            on conflict (language, chart) do update set items = excluded.items, fetched_at = now()`
  return results
}
