import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JavaScript script, no type declarations
import { appReach, BUILD_TOOLS, packagesInTree, PATCHED, triage } from '../../scripts/audit.mjs'

const advisory = (module_name: string, severity: string, paths: string[]) => ({ module_name, severity, vulnerable_versions: '<9', title: 't', url: 'u', findings: [{ version: '1', paths }] })

describe('the dependency audit in pnpm check', () => {
  it('blocks a high or critical issue in anything the server runs', () => {
    const { blocking } = triage({
      advisories: {
        1: advisory('feedlib', 'high', ['packages/core > feedlib@1.0.0']),
        2: advisory('hono-ish', 'critical', ['server > hono-ish@1.0.0']),
      },
    })
    expect(blocking).toHaveLength(2)
  })
  it('only reports issues in the app’s build tooling, and moderate ones anywhere', () => {
    const { blocking, reported } = triage({
      advisories: {
        1: advisory('braces', 'high', ['app > react-native@0.86.3 > braces@3.0.2', '. > braces@3.0.2']),
        2: advisory('fast-xml-parser', 'moderate', ['server > @polycast/core > fast-xml-parser@4.5.0']),
      },
    })
    expect(blocking).toEqual([])
    expect(reported).toHaveLength(2)
  })
  it('copes with an empty report', () => {
    expect(triage({})).toEqual({ blocking: [], reported: [], patched: [] })
  })

  // Today's real `pnpm audit --prod` report from the build run (17 Oct): five advisories, two high,
  // every one with empty paths, all from Expo's build tools.
  const today = {
    advisories: {
      1: { ...advisory('uuid', 'moderate', []), findings: [{ version: '7.0.3', paths: [] }] },
      2: { ...advisory('decode-uri-component', 'moderate', []), findings: [{ version: '0.2.2', paths: [] }] },
      3: { ...advisory('node-forge', 'high', []), findings: [{ version: '1.4.0', paths: [] }] },
      4: { ...advisory('braces', 'high', []), findings: [{ version: '3.0.3', paths: [] }] },
      5: { ...advisory('sprintf-js', 'moderate', []), findings: [{ version: '1.0.3', paths: [] }] },
    },
  }
  const serverTree = [
    { name: '@polycast/server', dependencies: { hono: { version: '4.9.0', dependencies: {} }, postgres: { version: '3.4.7' }, '@polycast/core': { version: '0.1.0', dependencies: { 'fast-xml-parser': { version: '5.2.5' } } } } },
    { name: '@polycast/core', dependencies: { 'fast-xml-parser': { version: '5.2.5' } } },
  ]

  it("lists every package in the server's own tree, nested ones included", () => {
    expect([...packagesInTree(serverTree)].sort()).toEqual(['@polycast/core@0.1.0', 'fast-xml-parser@5.2.5', 'hono@4.9.0', 'postgres@3.4.7'])
  })

  it("reports today's advisories without paths as not blocking, because none is in the server's tree", () => {
    const { blocking, reported } = triage(today, packagesInTree(serverTree))
    expect(blocking).toEqual([])
    expect(reported).toHaveLength(5)
  })

  it('blocks a high advisory in the server tree even when pnpm gives no paths', () => {
    const report = { advisories: { ...today.advisories, 9: { ...advisory('hono', 'high', []), findings: [{ version: '4.9.0', paths: [] }] } } }
    const { blocking } = triage(report, packagesInTree(serverTree))
    expect(blocking).toHaveLength(1)
    expect(blocking[0]).toContain('hono')
    // Another version of the same package, not the one the server runs, doesn't block.
    const other = { advisories: { 9: { ...advisory('hono', 'high', []), findings: [{ version: '3.0.0', paths: [] }] } } }
    expect(triage(other, packagesInTree(serverTree)).blocking).toEqual([])
  })

  it('lists an advisory fixed by a patch as patched, only for the patched version (PC-1023-07)', () => {
    const duc = (version: string) => ({ module_name: 'decode-uri-component', severity: 'moderate', vulnerable_versions: '<=0.4.2', title: 't', url: 'https://github.com/advisories/GHSA-vcc3-ghjq-m6fr', findings: [{ version, paths: [] }] })
    expect(triage({ advisories: { 1: duc('0.2.2') } })).toMatchObject({ reported: [], patched: [expect.stringContaining('patches/decode-uri-component@0.2.2.patch')] })
    expect(triage({ advisories: { 1: duc('0.4.1') } }).reported).toHaveLength(1)
    // PC-1030-02: the newer, high advisory is covered by the same patch, and still only for 0.2.2.
    const qr28 = (version: string) => ({ ...duc(version), severity: 'high', vulnerable_versions: '<=0.5.0', url: 'https://github.com/advisories/GHSA-qr28-fpjm-wq7f' })
    expect(triage({ advisories: { 1: qr28('0.2.2') } })).toMatchObject({ blocking: [], reported: [], patched: [expect.stringContaining('GHSA-qr28-fpjm-wq7f')] })
    expect(triage({ advisories: { 1: qr28('0.5.0') } }).patched).toHaveLength(0)
    for (const fix of Object.values(PATCHED) as { patch: string }[]) expect(existsSync(new URL(`../../${fix.patch}`, import.meta.url))).toBe(true)
  })
})

describe('the audit says which warnings ship (PC-1026-10)', () => {
  // Paths from the real `pnpm audit --prod` report of 27 Oct 2026.
  const zod = ['. > zod@3.25.76', 'app > expo@57.0.28 > @expo/cli@57.0.29 > zod@3.25.76', 'app > expo-audio@57.0.5 > expo@57.0.28 > @expo/cli@57.0.29 > zod@3.25.76']
  const forge = [
    '. > node-forge@1.4.0',
    'app > expo@57.0.28 > @expo/cli@57.0.29 > @expo/code-signing-certificates@0.0.6 > node-forge@1.4.0',
    'app > expo@57.0.28 > @expo/cli@57.0.29 > node-forge@1.4.0',
    'app > expo-updates@57.0.26 > @expo/code-signing-certificates@0.0.6 > node-forge@1.4.0',
  ]
  const uuid = ['. > uuid@7.0.3', 'app > expo@57.0.28 > @expo/config@57.0.10 > @expo/config-plugins@57.0.10 > xcode@3.0.1 > uuid@7.0.3']

  it('labels advisories that come only through Expo’s command-line tool and config plugins as build tool only', () => {
    expect(appReach(zod)).toBe('build tool only')
    expect(appReach(forge)).toBe('build tool only')
    expect(appReach(uuid)).toBe('build tool only')
    expect(BUILD_TOOLS).toContain('@expo/cli')
  })

  it('says an advisory ships when any path reaches it without a build tool', () => {
    expect(appReach([...zod, 'app > expo-router@57.0.26 > zod@3.25.76'])).toBe('ships in the app')
    expect(appReach(['app > react-native@0.86.3 > braces@3.0.2'])).toBe('ships in the app')
  })

  it('doesn’t guess without paths', () => {
    expect(appReach([])).toBe('reach unknown')
    expect(appReach(['. > zod@3.25.76'])).toBe('reach unknown')
    expect(appReach(undefined)).toBe('reach unknown')
  })

  it('puts the label at the start of each reported line, with server for moderate server advisories', () => {
    const adv = (module_name: string, severity: string, paths: string[]) => ({ module_name, severity, vulnerable_versions: '<9', title: 't', url: 'u', findings: [{ version: '1', paths }] })
    const { reported, blocking } = triage({
      advisories: {
        1: adv('zod', 'high', zod),
        2: adv('braces', 'high', ['app > react-native@0.86.3 > braces@3.0.2']),
        3: adv('fast-xml-parser', 'moderate', ['server > @polycast/core > fast-xml-parser@4.5.0']),
      },
    })
    expect(blocking).toEqual([])
    expect(reported).toEqual([expect.stringMatching(/^build tool only: high zod/), expect.stringMatching(/^ships in the app: high braces/), expect.stringMatching(/^server: moderate fast-xml-parser/)])
  })
})

describe('only named packages may run install scripts (PC-1028-04)', () => {
  it('spots install hooks and native builds', async () => {
    // @ts-expect-error plain JavaScript script, no type declarations
    const { runsOnInstall } = await import('../../scripts/audit.mjs')
    expect(runsOnInstall({ scripts: { postinstall: 'node install.js' } })).toBe(true)
    expect(runsOnInstall({ scripts: { preinstall: 'curl evil' } })).toBe(true)
    expect(runsOnInstall({ scripts: { install: 'node-gyp rebuild' } })).toBe(true)
    expect(runsOnInstall({ scripts: { test: 'vitest', build: 'tsc', prepare: 'husky' } })).toBe(false)
    expect(runsOnInstall({}, true)).toBe(true)
    expect(runsOnInstall({ scripts: { postinstall: '  ' } })).toBe(false)
  })

  it('flags a newcomer, and the lack of an allowlist', async () => {
    // @ts-expect-error plain JavaScript script, no type declarations
    const { unlistedInstallScripts, allowedInstallScripts } = await import('../../scripts/audit.mjs')
    expect(unlistedInstallScripts(['esbuild'], ['esbuild'])).toEqual([])
    expect(unlistedInstallScripts(['esbuild', 'sneaky-sdk'], ['esbuild'])[0]).toMatch(/^sneaky-sdk has an install script/)
    expect(unlistedInstallScripts([], undefined)).toHaveLength(1)
    expect(allowedInstallScripts({ pnpm: { onlyBuiltDependencies: ['esbuild'] } })).toEqual(['esbuild'])
    expect(allowedInstallScripts({})).toBeUndefined()
  })

  it('finds them in a real node_modules tree, scoped and nested', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    // @ts-expect-error plain JavaScript script, no type declarations
    const { installScriptPackages } = await import('../../scripts/audit.mjs')
    const nm = join(mkdtempSync(join(tmpdir(), 'pc-scripts-')), 'node_modules')
    const pkg = (dir: string, json: object, gyp = false) => {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.json'), JSON.stringify(json))
      if (gyp) writeFileSync(join(dir, 'binding.gyp'), '{}')
    }
    pkg(join(nm, 'plain'), { name: 'plain', scripts: { test: 'x' } })
    pkg(join(nm, '@scope', 'hooked'), { name: '@scope/hooked', scripts: { postinstall: 'node x.js' } })
    pkg(join(nm, 'plain', 'node_modules', 'deep'), { name: 'deep', scripts: { preinstall: 'node y.js' } })
    pkg(join(nm, 'native'), { name: 'native' }, true)
    expect(installScriptPackages([nm, join(nm, 'missing')])).toEqual(['@scope/hooked', 'deep', 'native'])
  })

  it('the repo’s own allowlist covers every package installed today', async () => {
    const { readFileSync } = await import('node:fs')
    // @ts-expect-error plain JavaScript script, no type declarations
    const { installScriptPackages, unlistedInstallScripts, allowedInstallScripts } = await import('../../scripts/audit.mjs')
    const root = new URL('../../', import.meta.url).pathname
    const allowed = allowedInstallScripts(JSON.parse(readFileSync(`${root}package.json`, 'utf8')))
    expect(allowed).toEqual(expect.arrayContaining(['esbuild']))
    expect(unlistedInstallScripts(installScriptPackages([`${root}node_modules`, `${root}app/node_modules`, `${root}server/node_modules`]), allowed)).toEqual([])
  })
})
