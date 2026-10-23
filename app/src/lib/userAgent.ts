/**
 * How Polycast introduces itself to podcast hosts on every episode request (PC-1019-04), the same
 * name the server uses (server/src/safeFetch.ts). Hosts and OP3 recognise apps by this header
 * (the open OPAWG list matches "^Polycast/"), so Polycast listens show up in a show's stats
 * rather than under "Unknown players". See docs/OPAWG.md.
 */
export const POLYCAST_USER_AGENT = 'Polycast/1.0 (+https://polycast.app)'

const isRemote = (url: string) => /^https?:\/\//i.test(url)

/** Headers for a request to a publisher's audio: only web addresses need them, not files on the phone. */
export function audioHeaders(url: string): Record<string, string> | undefined {
  return isRemote(url) ? { 'User-Agent': POLYCAST_USER_AGENT } : undefined
}

/** An expo-audio source for an episode address that names Polycast when it streams. */
export function audioSource(url: string): string | { uri: string; headers: Record<string, string> } {
  const headers = audioHeaders(url)
  return headers ? { uri: url, headers } : url
}
