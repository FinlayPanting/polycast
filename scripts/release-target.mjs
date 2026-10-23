#!/usr/bin/env node
/**
 * Decides how a night's app changes reach phones (PC-1020-U1):
 *   none        nothing in app/ or packages/core/ changed (server or docs only)
 *   update      the app changed but only its JavaScript: push to the `update` branch, which
 *               publishes an over-the-air update (app/.eas/workflows/update.yml), no build spent
 *   testflight  something native changed: push to `testflight` for a new build
 *
 * Native means anything baked into the build: app config, native modules, plugins and extension
 * targets, icons and splash, the app's dependency list (a new or changed package can bring native
 * code, and the Expo SDK is one of them), the shared lock file (it pins the versions every package
 * actually installs, including the app's native ones) and the root package.json apart from its
 * scripts (overrides and patches there change what the app installs) (PC-1021-01). When unsure, it says testflight; a needless build costs one of the
 * month's builds, a missed one leaves the update unable to reach anyone.
 *
 * TestFlight budget: Expo's free plan gives 15 iOS builds a calendar month. Every build is logged in
 * docs/testflight-builds.txt (one line: YYYY-MM-DD and a note). When a night needs `testflight` but the
 * month's builds are ahead of an even pace (14 spread across the month, one kept back for emergencies),
 * the script prints `testflight-held` instead: the native change waits for a later night.
 *
 * Usage: node scripts/release-target.mjs <base commit> [head commit, default HEAD]
 *        node scripts/release-target.mjs --budget   (prints this month's count and whether a build may go)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const APP_PATHS = [/^app\//, /^packages\/core\//, /^pnpm-lock\.yaml$/, /^pnpm-workspace\.yaml$/, /^\.npmrc$/]

const NATIVE_PATHS = [
  /^app\/app\.json$/,
  /^app\/app\.config\.[cm]?[jt]s$/,
  /^app\/eas\.json$/,
  /^app\/(ios|android|modules|plugins|targets|native)\//,
  /^app\/assets\/icons\//,
  /^app\/assets\/(icon|splash-icon|android-icon[^/]*|adaptive-icon)\.png$/,
  /^app\/\.eas\//,
  /^patches\//,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.npmrc$/,
]

/** True when the app's runtime dependencies differ between two package.json texts. */
export function dependenciesChanged(before, after) {
  const deps = (text) => {
    try {
      return JSON.parse(text ?? '{}').dependencies ?? {}
    } catch {
      return undefined
    }
  }
  const a = deps(before)
  const b = deps(after)
  if (!a || !b) return true
  const names = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const n of names) if (a[n] !== b[n]) return true
  return false
}

/** True when the root package.json differs in anything but its scripts (or can't be read). */
export function rootPackageChanged(before, after) {
  const strip = (text) => {
    try {
      const { scripts: _scripts, ...rest } = JSON.parse(text ?? '{}')
      return JSON.stringify(rest)
    } catch {
      return undefined
    }
  }
  const a = strip(before)
  const b = strip(after)
  return a === undefined || b === undefined || a !== b
}

/**
 * @param {string[]} changed paths changed between the two commits, relative to the repo root
 * @param {{ before?: string, after?: string }} appPackage app/package.json at each commit
 * @param {{ before?: string, after?: string }} rootPackage the root package.json at each commit
 * @returns {'none' | 'update' | 'testflight'}
 */
export function releaseTarget(changed, appPackage = {}, rootPackage = {}) {
  if (changed.includes('package.json') && rootPackageChanged(rootPackage.before, rootPackage.after)) return 'testflight'
  if (!changed.some((p) => APP_PATHS.some((r) => r.test(p)))) return 'none'
  if (changed.some((p) => NATIVE_PATHS.some((r) => r.test(p)))) return 'testflight'
  if (changed.includes('app/package.json') && dependenciesChanged(appPackage.before, appPackage.after)) return 'testflight'
  return 'update'
}

export const MONTHLY_BUILDS = 15
export const RESERVE = 1
export const BUDGET_LOG = 'docs/testflight-builds.txt'

/** Builds logged in the same calendar month as `today` (YYYY-MM-DD). Lines starting with # are notes. */
export function buildsThisMonth(logText, today) {
  const month = today.slice(0, 7)
  return (logText ?? '').split('\n').filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l.trim()) && l.trim().startsWith(month)).length
}

/**
 * Whether one more TestFlight build may go out today. Keeps builds to an even pace: by day d of a month
 * of n days, at most ceil((15 - reserve) * d / n) builds; the reserve is only for Finlay asking by hand.
 * @returns {{ used: number, allowedSoFar: number, limit: number, ok: boolean }}
 */
export function budget(used, today) {
  const [y, m, d] = today.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const planned = MONTHLY_BUILDS - RESERVE
  const allowedSoFar = Math.min(planned, Math.ceil((planned * d) / days))
  return { used, allowedSoFar, limit: MONTHLY_BUILDS, ok: used < allowedSoFar }
}

function show(commit, path) {
  try {
    return execFileSync('git', ['show', `${commit}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return undefined
  }
}

function todayInVienna() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date())
}

function readLog() {
  try {
    return readFileSync(BUDGET_LOG, 'utf8')
  } catch {
    return ''
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] === '--budget') {
    const today = todayInVienna()
    const b = budget(buildsThisMonth(readLog(), today), today)
    console.log(`${b.used} of ${b.limit} TestFlight builds used this month; pace allows ${b.allowedSoFar} by today: ${b.ok ? 'a build may go' : 'hold builds'}`)
    process.exit(0)
  }
  const [base, head = 'HEAD'] = process.argv.slice(2)
  if (!base) {
    console.error('Usage: node scripts/release-target.mjs <base commit> [head commit]')
    process.exit(2)
  }
  const changed = execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' }).split('\n').filter(Boolean)
  let target = releaseTarget(changed, { before: show(base, 'app/package.json'), after: show(head, 'app/package.json') }, { before: show(base, 'package.json'), after: show(head, 'package.json') })
  if (target === 'testflight') {
    const today = todayInVienna()
    if (!budget(buildsThisMonth(readLog(), today), today).ok) target = 'testflight-held'
  }
  console.log(target)
}
