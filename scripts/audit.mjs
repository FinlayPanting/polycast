#!/usr/bin/env node
/**
 * Dependency audit, run by `pnpm check`. Fails on a high or critical advisory in anything the
 * server runs (the server and @polycast/core, production dependencies only). Advisories that only
 * reach the app's build tooling are reported, not blocking. If the registry can't be reached
 * (offline), it says so and lets the check carry on.
 *
 * Every reported line says where the advisory reaches (PC-1026-10): "build tool only" when every path
 * to it runs through a build tool (Expo's command-line tool, config plugins, Metro, Babel), which never
 * reaches a learner's phone or the server; "ships in the app" when some path doesn't; "server" for
 * moderate ones in the server's tree; "reach unknown" when pnpm gives no paths.
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** Workspace folders whose production dependencies run on the server. */
export const SERVER_SIDE = ['server', 'packages/core']
const BLOCKING = new Set(['high', 'critical'])
/**
 * Advisories fixed by a patch in `patches/` rather than an upgrade (pnpm's patchedDependencies), keyed by
 * advisory id. The audit only sees the version number, so these are listed as patched, not reported.
 */
export const PATCHED = {
  // PC-1023-07: 0.3 and later are ES modules only, and expo-router's query-string 7 require()s it.
  'GHSA-vcc3-ghjq-m6fr': { module: 'decode-uri-component', version: '0.2.2', patch: 'patches/decode-uri-component@0.2.2.patch' },
}

/**
 * Packages that only run while building or bundling the app (on a Mac or EAS), never on a phone or the server.
 * A path to an advisory through any of these is a build-tool path.
 */
export const BUILD_TOOLS = [
  '@expo/cli',
  '@expo/config',
  '@expo/config-plugins',
  '@expo/prebuild-config',
  '@expo/metro-config',
  '@expo/fingerprint',
  // Only expo-updates' command-line scripts (cli/) use it, to make signing keys; the app's bundle never does.
  '@expo/code-signing-certificates',
  'babel-preset-expo',
  'eas-cli',
  'metro',
  '@babel/core',
]

/** The package names along a pnpm audit path ("app > expo@57.0.28 > @expo/cli@57.0.29 > zod@3.25.76"). */
const pathNames = (path) => path.split(' > ').map((seg) => seg.replace(/(.)@[^@]*$/, '$1'))

/**
 * Where an advisory reaches, from its paths: 'build tool only', 'ships in the app', or 'reach unknown'.
 * Paths straight from the workspace root (". > zod@3.25.76") are how pnpm lists hoisted copies and say
 * nothing about who uses them, so they're skipped.
 */
export function appReach(paths) {
  const telling = (paths ?? []).filter((p) => pathNames(p).length > 2 || pathNames(p)[0] !== '.')
  if (!telling.length) return 'reach unknown'
  return telling.every((p) => pathNames(p).slice(1, -1).some((n) => BUILD_TOOLS.includes(n))) ? 'build tool only' : 'ships in the app'
}

/** Every `name@version` in a `pnpm list --json` tree. */
export function packagesInTree(list) {
  const out = new Set()
  const walk = (deps) => {
    for (const [name, d] of Object.entries(deps ?? {})) {
      if (d?.version) out.add(`${name}@${d.version}`)
      walk(d?.dependencies)
    }
  }
  for (const project of Array.isArray(list) ? list : [list]) walk(project?.dependencies)
  return out
}

/**
 * Splits a `pnpm audit --json` report into what blocks the check and what is only reported.
 * `serverPackages` (from `pnpm list` on the server's own workspaces) decides what the server runs;
 * pnpm's audit doesn't always fill in `paths`, so they're only a fallback.
 */
export function triage(report, serverPackages) {
  const blocking = []
  const reported = []
  const patched = []
  for (const a of Object.values(report?.advisories ?? {})) {
    const id = String(a.github_advisory_id ?? a.url ?? '').match(/GHSA(-[0-9a-z]{4}){3}/i)?.[0]
    const fix = id ? PATCHED[id] : undefined
    const versions = (a.findings ?? []).map((f) => f.version).filter(Boolean)
    if (fix && fix.module === a.module_name && versions.length && versions.every((v) => v === fix.version)) {
      patched.push(`${a.module_name} ${fix.version}: ${id} (${fix.patch})`)
      continue
    }
    const roots = new Set((a.findings ?? []).flatMap((f) => f.paths ?? []).map((p) => p.split(' > ')[0]))
    const inServerTree = serverPackages ? versions.some((v) => serverPackages.has(`${a.module_name}@${v}`)) : false
    const serverSide = inServerTree || SERVER_SIDE.some((w) => roots.has(w))
    if (!roots.size) roots.add(inServerTree ? 'server' : 'no paths')
    const line = `${a.severity} ${a.module_name} ${a.vulnerable_versions} (${[...roots].join(', ')}): ${a.title ?? ''} ${a.url ?? ''}`.trim()
    if (serverSide && BLOCKING.has(a.severity)) blocking.push(line)
    else reported.push(`${serverSide ? 'server' : appReach((a.findings ?? []).flatMap((f) => f.paths ?? []))}: ${line}`)
  }
  return { blocking, reported, patched }
}

function main() {
  let out
  try {
    out = execFileSync('pnpm', ['audit', '--prod', '--json'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) {
    // pnpm audit exits non-zero when it finds anything; the report is still on stdout.
    out = e.stdout
  }
  let report
  try {
    report = JSON.parse(out)
  } catch {
    console.log('audit: could not reach the registry, skipped')
    return
  }
  if (report.error) {
    console.log(`audit: skipped (${report.error.code ?? 'registry error'})`)
    return
  }
  // What the server and @polycast/core actually run, asked of pnpm directly.
  let serverPackages
  try {
    const list = execFileSync('pnpm', ['--filter', '@polycast/server', '--filter', '@polycast/core', 'list', '--prod', '--depth', 'Infinity', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    serverPackages = packagesInTree(JSON.parse(list))
  } catch {
    console.log("audit: couldn't list the server's dependencies; going by the report's paths")
  }
  const { blocking, reported, patched } = triage(report, serverPackages)
  for (const l of patched) console.log(`audit (patched in place): ${l}`)
  // What ships first, so the rare advisory that reaches a phone or the server stands out (PC-1026-10).
  const order = (l) => (l.startsWith('build tool only') ? 1 : 0)
  for (const l of [...reported].sort((a, b) => order(a) - order(b))) console.log(`audit (not blocking) ${l}`)
  for (const l of blocking) console.error(`audit BLOCKING: ${l}`)
  if (blocking.length) process.exit(1)
  const tools = reported.filter((l) => l.startsWith('build tool only')).length
  console.log(`audit: nothing high or critical in the server's dependencies (${reported.length} reported, ${tools} build tool only)`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
