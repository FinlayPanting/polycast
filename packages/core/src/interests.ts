/**
 * Interests a learner picks so Discover can lead with shows they'll enjoy in the language they're
 * learning. About a dozen big tiles, some with optional chips to narrow one down.
 *
 * Each interest is found either through Podcast Index categories (trending shows in the language)
 * or, where no category exists (Formula One), an Apple search in the language's countries.
 */

export type InterestSource = { categories: string[] } | { search: string }

export interface SubInterest {
  id: string
  label: string
  why: string
  source: InterestSource
}

export interface Interest {
  id: string
  label: string
  why: string
  source: InterestSource
  subs: SubInterest[]
}

const cat = (...categories: string[]): InterestSource => ({ categories })

export const INTERESTS: Interest[] = [
  {
    id: 'sport',
    label: 'Sport',
    why: 'Because you like sport',
    source: cat('Sports'),
    subs: [
      { id: 'football', label: 'Football', why: 'Because you follow football', source: cat('Soccer') },
      { id: 'f1', label: 'Formula One', why: 'Because you follow Formula One', source: { search: 'Formula 1' } },
      { id: 'tennis', label: 'Tennis', why: 'Because you follow tennis', source: cat('Tennis') },
      { id: 'running', label: 'Running', why: 'Because you like running', source: cat('Running') },
      { id: 'golf', label: 'Golf', why: 'Because you follow golf', source: cat('Golf') },
    ],
  },
  {
    id: 'psychology',
    label: 'Psychology',
    why: 'Because you’re curious about people',
    source: cat('Mental', 'Self-Improvement', 'Relationships'),
    subs: [
      { id: 'relationships', label: 'Relationships', why: 'Because you’re interested in relationships', source: cat('Relationships') },
      { id: 'self-improvement', label: 'Self-improvement', why: 'Because you like self-improvement', source: cat('Self-Improvement') },
    ],
  },
  {
    id: 'health',
    label: 'Health and nutrition',
    why: 'Because you care about health',
    source: cat('Health', 'Fitness', 'Nutrition'),
    subs: [
      { id: 'nutrition', label: 'Nutrition', why: 'Because you’re into nutrition', source: cat('Nutrition') },
      { id: 'fitness', label: 'Fitness', why: 'Because you’re into fitness', source: cat('Fitness') },
    ],
  },
  { id: 'music', label: 'Music', why: 'Because you love music', source: cat('Music'), subs: [] },
  { id: 'comedy', label: 'Comedy', why: 'Because you like a laugh', source: cat('Comedy'), subs: [] },
  {
    id: 'news',
    label: 'News',
    why: 'Because you keep up with the news',
    source: cat('News'),
    subs: [{ id: 'politics', label: 'Politics', why: 'Because you follow politics', source: cat('Politics') }],
  },
  { id: 'tech', label: 'Tech', why: 'Because you like tech', source: cat('Technology'), subs: [] },
  { id: 'history', label: 'History', why: 'Because you like history', source: cat('History'), subs: [] },
  { id: 'science', label: 'Science', why: 'Because you like science', source: cat('Science'), subs: [] },
  { id: 'true-crime', label: 'True crime', why: 'Because you like true crime', source: cat('True Crime'), subs: [] },
  {
    id: 'culture',
    label: 'Books, film and TV',
    why: 'Because you love stories',
    source: cat('Books', 'Film', 'TV'),
    subs: [
      { id: 'books', label: 'Books', why: 'Because you love books', source: cat('Books') },
      { id: 'film-tv', label: 'Film and TV', why: 'Because you love film and TV', source: cat('Film', 'TV') },
    ],
  },
  {
    id: 'business',
    label: 'Business and money',
    why: 'Because you’re interested in business',
    source: cat('Business', 'Investing'),
    subs: [],
  },
]

/** Most a learner can pick, so the shelf stays focused. */
export const MAX_INTERESTS = 6

/**
 * Cleans a saved list of interest ids ("sport", or "sport/f1" for a chip). Unknown ids are dropped,
 * a chip implies its tile, duplicates go, and the list is capped at MAX_INTERESTS tiles.
 */
export function normaliseInterests(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  const tiles: string[] = []
  const subs = new Map<string, string[]>()
  for (const raw of ids) {
    if (typeof raw !== 'string') continue
    const [tileId, subId] = raw.split('/')
    const interest = INTERESTS.find((i) => i.id === tileId)
    if (!interest) continue
    if (!tiles.includes(interest.id)) {
      if (tiles.length >= MAX_INTERESTS) continue
      tiles.push(interest.id)
    }
    if (subId && interest.subs.some((s) => s.id === subId)) {
      const list = subs.get(interest.id) ?? []
      if (!list.includes(subId)) list.push(subId)
      subs.set(interest.id, list)
    }
  }
  return tiles.flatMap((t) => [t, ...(subs.get(t) ?? []).map((s) => `${t}/${s}`)])
}

export interface InterestQuery {
  /** A stable key for caching this query's results. */
  key: string
  why: string
  source: InterestSource
}

/**
 * What to look up for a learner's interests. A tile narrowed by chips uses only those chips;
 * otherwise the whole tile.
 */
export function interestQueries(ids: string[]): InterestQuery[] {
  const clean = normaliseInterests(ids)
  const out: InterestQuery[] = []
  for (const id of clean) {
    if (id.includes('/')) continue
    const interest = INTERESTS.find((i) => i.id === id)!
    const chosen = clean.filter((x) => x.startsWith(`${id}/`)).map((x) => interest.subs.find((s) => s.id === x.split('/')[1])!)
    if (chosen.length) for (const s of chosen) out.push({ key: `${id}/${s.id}`, why: s.why, source: s.source })
    else out.push({ key: id, why: interest.why, source: interest.source })
  }
  return out
}

/**
 * Taps on the interest picker. Tapping a picked tile removes it and its chips; tapping a chip
 * toggles it (and picks its tile). Nothing new is added once MAX_INTERESTS tiles are picked.
 */
export function toggleInterest(selected: string[], id: string): string[] {
  const current = normaliseInterests(selected)
  const [tile] = id.split('/')
  if (current.includes(id)) return current.filter((x) => (id.includes('/') ? x !== id : x !== tile && !x.startsWith(`${tile}/`)))
  return normaliseInterests([...current, ...(id.includes('/') ? [tile!, id] : [id])])
}
