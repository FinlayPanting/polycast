import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JavaScript script, no type declarations
import { packagesInTree, PATCHED, triage } from '../../scripts/audit.mjs'

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
    for (const fix of Object.values(PATCHED) as { patch: string }[]) expect(existsSync(new URL(`../../${fix.patch}`, import.meta.url))).toBe(true)
  })
})
