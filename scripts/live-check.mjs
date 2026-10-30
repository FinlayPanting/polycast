#!/usr/bin/env node
// Is the live server running this commit? (PC-1029-05)
// Usage: node scripts/live-check.mjs [commit]   (default: HEAD)
// Prints "live", "old <commit>" or "down", and exits 0 only for "live". Railway reports the commit it deployed in
// /health; if a build fails it keeps serving the last good one, so "ok" alone doesn't mean a push went live.
import { execSync } from 'node:child_process'

export const HEALTH_URL = 'https://polycast-production.up.railway.app/health'

/** Compares /health's answer with the commit that should be live. */
export function liveState(body, expected) {
  if (!body || body.ok !== true) return 'down'
  const commit = typeof body.commit === 'string' ? body.commit.toLowerCase() : ''
  if (!commit) return 'old unknown'
  const want = expected.toLowerCase()
  return commit.startsWith(want) || want.startsWith(commit) ? 'live' : `old ${commit.slice(0, 7)}`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const expected = process.argv[2] ?? execSync('git rev-parse HEAD').toString().trim()
  let state = 'down'
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(20_000) })
    state = liveState(res.ok ? await res.json() : undefined, expected)
  } catch {
    state = 'down'
  }
  console.log(state)
  process.exit(state === 'live' ? 0 : 1)
}
