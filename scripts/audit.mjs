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

/** Splits a `pnpm audit --json` report into what blocks the check and what is only reported. */
export function triage(report) {
  const blocking = []
  const reported = []
  for (const a of Object.values(report?.advisories ?? {})) {
    const roots = new Set((a.findings ?? []).flatMap((f) => f.paths ?? []).map((p) => p.split(' > ')[0]))
    const serverSide = SERVER_SIDE.some((w) => roots.has(w))
    const line = `${a.severity} ${a.module_name} ${a.vulnerable_versions} (${[...roots].join(', ')}): ${a.title ?? ''} ${a.url ?? ''}`.trim()
    if (serverSide && BLOCKING.has(a.severity)) blocking.push(line)
    else reported.push(line)
  }
  return { blocking, reported }
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
  const { blocking, reported } = triage(report)
  for (const l of reported) console.log(`audit (not blocking): ${l}`)
  for (const l of blocking) console.error(`audit BLOCKING: ${l}`)
  if (blocking.length) process.exit(1)
  console.log(`audit: nothing high or critical in the server's dependencies (${reported.length} reported)`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
