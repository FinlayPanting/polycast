import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JavaScript script, no type declarations
import { triage } from '../../scripts/audit.mjs'

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
    expect(triage({})).toEqual({ blocking: [], reported: [] })
  })
})
