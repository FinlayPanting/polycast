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
 * Usage: node scripts/release-target.mjs <base commit> [head commit, default HEAD]
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const APP_PATHS = [/^app\//, /^packages\/core\//, /^pnpm-lock\.yaml$/, /^pnpm-workspace\.yaml$/, /^\.npmrc$/]

const NATIVE_PATHS = [
  /^app\/app\.json$/,
  /^app\/app\.config\.[cm]?[jt]s$/,
  /^app\/eas\.json$/,
  /^app\/(ios|android|modules|plugins|targets)\//,
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
  console.log(releaseTarget(changed, { before: show(base, 'app/package.json'), after: show(head, 'app/package.json') }, { before: show(base, 'package.json'), after: show(head, 'package.json') }))
}
