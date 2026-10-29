import { describe, expect, it } from 'vitest'
import { deviceTimeZone } from './timeZone'

describe('deviceTimeZone (PC-1028-01)', () => {
  it('passes on a real IANA name', () => {
    expect(deviceTimeZone(() => 'America/Los_Angeles')).toBe('America/Los_Angeles')
    expect(deviceTimeZone(() => 'Etc/GMT+5')).toBe('Etc/GMT+5')
    expect(typeof deviceTimeZone()).toBe('string')
  })
  it('sends nothing rather than something odd', () => {
    expect(deviceTimeZone(() => undefined)).toBeUndefined()
    expect(deviceTimeZone(() => '')).toBeUndefined()
    expect(deviceTimeZone(() => 'x'.repeat(80))).toBeUndefined()
    expect(deviceTimeZone(() => "'; drop table")).toBeUndefined()
    expect(deviceTimeZone(() => { throw new Error('no Intl') })).toBeUndefined()
  })
})
