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
 *
 * Install scripts (PC-1028-04): only the packages named in the root package.json's
 * `pnpm.onlyBuiltDependencies` may run a script when installed (pnpm 9 blocks the rest once that list
 * exists). The check fails on any installed package that has an install script and isn't named there,
 * so a newcomer is a decision, never a surprise. This part runs offline too.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall']

/** Whether a package.json (parsed) runs anything when installed: an install hook, or a native build (binding.gyp). */
export function runsOnInstall(pkg, hasBindingGyp = false) {
  return INSTALL_HOOKS.some((h) => typeof pkg?.scripts?.[h] === 'string' && pkg.scripts[h].trim() !== '') || hasBindingGyp
}

/** Names of installed packages under these node_modules folders that run something on install. */
export function installScriptPackages(nodeModulesDirs) {
  const found = new Set()
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entries) {
      if (e.startsWith('.')) continue
      const p = join(dir, e)
      if (e.startsWith('@')) {
        walk(p)
        continue
      }
      const pj = join(p, 'package.json')
      if (existsSync(pj)) {
        try {
          const pkg = JSON.parse(readFileSync(pj, 'utf8'))
          if (pkg.name && runsOnInstall(pkg, existsSync(join(p, 'binding.gyp')))) found.add(pkg.name)
        } catch {
          // An unreadable package.json is pnpm's problem, not this check's.
        }
      }
      walk(join(p, 'node_modules'))
    }
  }
  for (const d of nodeModulesDirs) walk(d)
  return [...found].sort()
}

/** The install-script allowlist from the root package.json (pnpm.onlyBuiltDependencies), or undefined if there is none. */
export function allowedInstallScripts(rootPackage) {
  const list = rootPackage?.pnpm?.onlyBuiltDependencies
  return Array.isArray(list) ? list : undefined
}

/** Lines for the check: packages that run something on install but aren't on the allowlist. No allowlist at all fails too. */
export function unlistedInstallScripts(found, allowed) {
  if (!allowed) return ['the root package.json has no pnpm.onlyBuiltDependencies, so every package may run install scripts']
  const ok = new Set(allowed)
  return found.filter((n) => !ok.has(n)).map((n) => `${n} has an install script and isn't in pnpm.onlyBuiltDependencies (add it there only if it truly needs to run one)`)
}

function checkInstallScripts(root) {
  const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const workspaces = ['', 'app', 'server', ...(existsSync(join(root, 'packages')) ? readdirSync(join(root, 'packages')).map((d) => `packages/${d}`) : [])]
  const found = installScriptPackages(workspaces.map((w) => join(root, w, 'node_modules')))
  const problems = unlistedInstallScripts(found, allowedInstallScripts(rootPackage))
  for (const l of problems) console.error(`install scripts BLOCKING: ${l}`)
  if (!problems.length) console.log(`install scripts: only allowlisted packages may run them (${found.join(', ') || 'none installed'})`)
  return problems.length === 0
}

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
  const scriptsOk = checkInstallScripts(process.cwd())
  if (!scriptsOk) process.exitCode = 1
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
