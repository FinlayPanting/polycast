import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JavaScript script, no type declarations
import { budget, buildsThisMonth, dependenciesChanged, releaseTarget, rootPackageChanged } from '../../scripts/release-target.mjs'

const pkg = (deps: Record<string, string>, extra: Record<string, unknown> = {}) => JSON.stringify({ name: 'app', dependencies: deps, ...extra })

describe('which way a night of app changes reaches phones (PC-1020-U1)', () => {
  it('sends nothing for server or docs changes', () => {
    expect(releaseTarget(['server/src/api.ts', 'docs/DECISIONS.md', 'server/changelog.json'])).toBe('none')
    expect(releaseTarget([])).toBe('none')
  })

  it('sends an over-the-air update for screens, copy and player logic', () => {
    expect(releaseTarget(['app/src/app/(tabs)/index.tsx', 'app/src/player/PlayerProvider.tsx', 'server/changelog.json'])).toBe('update')
    expect(releaseTarget(['packages/core/src/allowances.ts'])).toBe('update')
    expect(releaseTarget(['app/assets/fonts/x.ttf', 'app/src/lib/words.ts'])).toBe('update')
  })

  it('needs a TestFlight build when anything native changes', () => {
    for (const p of ['app/app.json', 'app/app.config.js', 'app/eas.json', 'app/modules/polycast-fingerprint/ios/Fingerprint.swift', 'app/plugins/withLiveActivity.js', 'app/targets/live-line/LiveLineWidget.swift', 'app/native/PolycastShortcuts.swift', 'app/assets/icons/flag-se.png', 'app/assets/icon.png', 'app/.eas/workflows/testflight.yml']) {
      expect(releaseTarget(['app/src/lib/words.ts', p]), p).toBe('testflight')
    }
  })

  it('needs a build when the app gains, loses or changes a dependency, including the Expo SDK', () => {
    const before = pkg({ expo: '~57.0.28', react: '19.1.0' })
    expect(releaseTarget(['app/package.json'], { before, after: pkg({ expo: '~57.0.28', react: '19.1.0', 'expo-updates': '~57.0.26' }) })).toBe('testflight')
    expect(releaseTarget(['app/package.json'], { before, after: pkg({ expo: '~58.0.0', react: '19.1.0' }) })).toBe('testflight')
    expect(releaseTarget(['app/package.json'], { before, after: pkg({ expo: '~57.0.28' }) })).toBe('testflight')
  })

  it('stays an update when only scripts or dev tools in package.json change', () => {
    const before = pkg({ expo: '~57.0.28' }, { devDependencies: { vitest: '^3.2.4' } })
    const after = pkg({ expo: '~57.0.28' }, { devDependencies: { vitest: '^3.3.0' }, scripts: { test: 'vitest run' } })
    expect(releaseTarget(['app/package.json', 'app/src/lib/words.ts'], { before, after })).toBe('update')
  })

  it('needs a build when the shared lock file changes, alone or with a screen (PC-1021-01)', () => {
    expect(releaseTarget(['pnpm-lock.yaml'])).toBe('testflight')
    expect(releaseTarget(['pnpm-lock.yaml', 'app/src/app/(tabs)/index.tsx'])).toBe('testflight')
    expect(releaseTarget(['pnpm-workspace.yaml'])).toBe('testflight')
  })

  it('needs a build when the root package.json changes beyond its scripts (PC-1021-01)', () => {
    const root = (extra: Record<string, unknown>) => JSON.stringify({ name: 'polycast', scripts: { check: 'pnpm test' }, ...extra })
    expect(releaseTarget(['package.json'], {}, { before: root({}), after: root({ pnpm: { overrides: { 'react-native': '0.86.4' } } }) })).toBe('testflight')
    expect(releaseTarget(['package.json', 'app/src/lib/words.ts'], {}, { before: root({}), after: root({ devDependencies: { typescript: '~5.9.0' } }) })).toBe('testflight')
    expect(releaseTarget(['package.json'], {}, { before: root({}), after: JSON.stringify({ name: 'polycast', scripts: { check: 'pnpm typecheck && pnpm test' } }) })).toBe('none')
    expect(rootPackageChanged(undefined, root({}))).toBe(true)
  })

  it('needs no build for the install-script allowlist alone (PC-1028-04), but still does for a patch beside it', () => {
    const root = (extra: Record<string, unknown>) => JSON.stringify({ name: 'polycast', scripts: { check: 'pnpm test' }, ...extra })
    const patches = { patchedDependencies: { 'a@1': 'patches/a@1.patch' } }
    expect(rootPackageChanged(root({ pnpm: patches }), root({ pnpm: { onlyBuiltDependencies: ['esbuild'], ...patches } }))).toBe(false)
    expect(rootPackageChanged(root({}), root({ pnpm: { onlyBuiltDependencies: ['esbuild'] } }))).toBe(false)
    expect(rootPackageChanged(root({ pnpm: { onlyBuiltDependencies: ['esbuild'] } }), root({ pnpm: { onlyBuiltDependencies: ['esbuild'], overrides: { x: '1' } } }))).toBe(true)
    expect(rootPackageChanged(root({ pnpm: patches }), root({ pnpm: { onlyBuiltDependencies: ['esbuild'] } }))).toBe(true)
  })

  it('plays safe when package.json can not be read', () => {
    expect(dependenciesChanged(undefined, pkg({ expo: '1' }))).toBe(true)
    expect(dependenciesChanged('not json', pkg({}))).toBe(true)
  })
})

describe('the over-the-air update workflow', () => {
  const read = (p: string) => readFileSync(new URL(`../../app/${p}`, import.meta.url), 'utf8')

  it('uses the same public settings as the TestFlight build, so updates talk to the live server', () => {
    const base = JSON.parse(read('eas.json')).build.base.env as Record<string, string>
    const workflow = read('.eas/workflows/update.yml')
    for (const [k, v] of Object.entries(base)) expect(workflow).toContain(`${k}: ${v}`)
  })

  it('publishes to the production channel that store builds listen on, and only for matching native code', () => {
    const eas = JSON.parse(read('eas.json'))
    const app = JSON.parse(read('app.json')).expo
    expect(eas.build.production.channel).toBe('production')
    expect(read('.eas/workflows/update.yml')).toMatch(/channel: production/)
    expect(app.runtimeVersion).toEqual({ policy: 'fingerprint' })
    expect(app.updates.url).toBe(`https://u.expo.dev/${app.extra.eas.projectId}`)
  })
})

describe('TestFlight build budget: 15 a month, spread out', () => {
  const log = '# notes\n2026-09-30 old\n2026-10-19 b1\n2026-10-19 b2\n2026-10-20 b3\n'
  it('counts only this calendar month and ignores notes', () => {
    expect(buildsThisMonth(log, '2026-10-22')).toBe(3)
    expect(buildsThisMonth(log, '2026-11-01')).toBe(0)
    expect(buildsThisMonth('', '2026-10-22')).toBe(0)
  })
  it('keeps to an even pace and one build in reserve', () => {
    expect(budget(0, '2026-10-01').ok).toBe(true)
    expect(budget(1, '2026-10-01').ok).toBe(false)
    expect(budget(7, '2026-10-22')).toMatchObject({ allowedSoFar: 10, ok: true })
    expect(budget(10, '2026-10-22').ok).toBe(false)
    expect(budget(13, '2026-10-31').ok).toBe(true)
    expect(budget(14, '2026-10-31').ok).toBe(false)
    expect(budget(14, '2026-02-28').allowedSoFar).toBe(14)
  })
})
