export interface ItunesResult {
  collectionId: number
  collectionName: string
  artistName: string
  artworkUrl100: string
  artworkUrl600: string
  feedUrl?: string
}

const BASE = 'https://itunes.apple.com'

export async function searchPodcasts(query: string): Promise<ItunesResult[]> {
  const url = `${BASE}/search?term=${encodeURIComponent(query)}&media=podcast&limit=25`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`)
  const data = await res.json()
  return data.results as ItunesResult[]
}

export async function fetchPodcastById(id: string): Promise<ItunesResult | null> {
  const url = `${BASE}/lookup?id=${id}&entity=podcast`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`iTunes lookup failed: ${res.status}`)
  const data = await res.json()
  return (data.results?.[0] as ItunesResult) ?? null
}
