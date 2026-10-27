#!/usr/bin/env node
/**
 * Dependency audit, run by `pnpm check`. Fails on a high or critical advisory in anything the
 * server runs (the server and @polycast/core, production dependencies only). Advisories that only
 * reach the app's build tooling are reported, not blocking. If the registry can't be reached
 * (offline), it says so and lets the check carry on.
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
    else reported.push(line)
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
  for (const l of reported) console.log(`audit (not blocking): ${l}`)
  for (const l of blocking) console.error(`audit BLOCKING: ${l}`)
  if (blocking.length) process.exit(1)
  console.log(`audit: nothing high or critical in the server's dependencies (${reported.length} reported)`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
