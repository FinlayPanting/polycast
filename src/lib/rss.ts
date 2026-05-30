export interface Episode {
  guid: string
  title: string
  pubDate: string
  duration: string
  enclosureUrl: string
  enclosureLength?: number
  description?: string
}

const PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
]

async function attemptFetch(feedUrl: string, signal?: AbortSignal): Promise<Episode[]> {
  let lastErr: Error = new Error('All feed fetch attempts failed')

  // Try direct first (works if the RSS server sends CORS headers)
  try {
    const res = await fetch(feedUrl, { signal })
    if (res.ok) {
      const text = await res.text()
      return parseFeed(text)
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    // CORS or network error — fall through to proxies
  }

  for (const makeUrl of PROXIES) {
    const proxyUrl = makeUrl(feedUrl)
    console.log('[polycast] rss via proxy:', proxyUrl.slice(0, 80))
    try {
      const res = await fetch(proxyUrl, { signal })
      if (res.ok) {
        const text = await res.text()
        return parseFeed(text)
      }
      lastErr = new Error(`Feed proxy returned ${res.status}`)
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      lastErr = e instanceof Error ? e : new Error(String(e))
      console.warn('[polycast] rss proxy failed:', lastErr.message)
    }
  }

  throw lastErr
}

export async function fetchFeed(feedUrl: string, signal?: AbortSignal): Promise<Episode[]> {
  const MAX_RETRIES = 2
  let lastErr: Error = new Error('All feed fetch attempts failed')
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await attemptFetch(feedUrl, signal)
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (attempt < MAX_RETRIES - 1) {
        console.log('[polycast] rss retry', attempt + 1)
        await new Promise((r) => setTimeout(r, 800))
      }
    }
  }
  throw lastErr
}

function parseFeed(xml: string): Episode[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  // Detect parse error
  if (doc.querySelector('parsererror')) {
    // Try text/html fallback (some proxies return mangled content-type)
    const doc2 = parser.parseFromString(xml, 'text/html')
    const items2 = Array.from(doc2.querySelectorAll('item'))
    if (items2.length === 0) throw new Error('Failed to parse RSS feed')
    return items2.map(parseItem)
  }

  const items = Array.from(doc.querySelectorAll('item'))
  return items.map(parseItem)
}

function parseItem(item: Element): Episode {
  const get = (tag: string) =>
    (item.querySelector(tag) ??
      item.getElementsByTagNameNS('http://www.itunes.com/dtds/podcast-1.0.dtd', tag.replace('itunes:', ''))?.item(0))
      ?.textContent?.trim() ?? ''

  const enclosure = item.querySelector('enclosure')
  const guid = item.querySelector('guid')?.textContent?.trim() ||
    item.querySelector('link')?.textContent?.trim() ||
    Math.random().toString(36)

  const rawDuration =
    item.getElementsByTagNameNS('http://www.itunes.com/dtds/podcast-1.0.dtd', 'duration')?.item(0)?.textContent?.trim() ||
    get('duration')

  return {
    guid,
    title: get('title'),
    pubDate: formatDate(get('pubDate')),
    duration: formatDuration(rawDuration),
    enclosureUrl: enclosure?.getAttribute('url') ?? '',
    enclosureLength: Number(enclosure?.getAttribute('length') ?? 0) || undefined,
    description: get('description'),
  }
}

function formatDate(raw: string): string {
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return raw
  }
}

function formatDuration(raw: string): string {
  if (!raw) return ''
  if (raw.includes(':')) return raw
  const secs = parseInt(raw, 10)
  if (isNaN(secs)) return raw
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}
