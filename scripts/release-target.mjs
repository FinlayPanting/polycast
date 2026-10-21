#!/usr/bin/env node
/**
 * Decides how a night's app changes reach phones (PC-1020-U1):
 *   none        nothing in app/ or packages/core/ changed (server or docs only)
 *   update      the app changed but only its JavaScript: push to the `update` branch, which
 *               publishes an over-the-air update (app/.eas/workflows/update.yml), no build spent
 *   testflight  something native changed: push to `testflight` for a new build
 *
 * Native means anything baked into the build: app config, native modules and plugins, icons and
 * splash, or the app's dependency list (a new or changed package can bring native code, and the
 * Expo SDK is one of them). When unsure, it says testflight; a needless build costs one of the
 * month's builds, a missed one leaves the update unable to reach anyone.
 *
 * Usage: node scripts/release-target.mjs <base commit> [head commit, default HEAD]
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const APP_PATHS = [/^app\//, /^packages\/core\//]

const NATIVE_PATHS = [
  /^app\/app\.json$/,
  /^app\/app\.config\.[cm]?[jt]s$/,
  /^app\/eas\.json$/,
  /^app\/(ios|android|modules|plugins)\//,
  /^app\/assets\/icons\//,
  /^app\/assets\/(icon|splash-icon|android-icon[^/]*|adaptive-icon)\.png$/,
  /^app\/\.eas\//,
  /^patches\//,
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

/**
 * @param {string[]} changed paths changed between the two commits, relative to the repo root
 * @param {{ before?: string, after?: string }} appPackage app/package.json at each commit
 * @returns {'none' | 'update' | 'testflight'}
 */
export function releaseTarget(changed, appPackage = {}) {
  if (!changed.some((p) => APP_PATHS.some((r) => r.test(p)))) return 'none'
  if (changed.some((p) => NATIVE_PATHS.some((r) => r.test(p)))) return 'testflight'
  if (changed.includes('app/package.json') && dependenciesChanged(appPackage.before, appPackage.after)) return 'testflight'
  return 'update'
}

function show(commit, path) {
  try {
    return execFileSync('git', ['show', `${commit}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return undefined
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base, head = 'HEAD'] = process.argv.slice(2)
  if (!base) {
    console.error('Usage: node scripts/release-target.mjs <base commit> [head commit]')
    process.exit(2)
  }
  const changed = execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' }).split('\n').filter(Boolean)
  console.log(releaseTarget(changed, { before: show(base, 'app/package.json'), after: show(head, 'app/package.json') }))
}
