import { describe, expect, it } from 'vitest'
import { supportLink } from './supportShow'

describe('Support this show (PC-1018-09)', () => {
  it('links only to a plain https page, naming the site', () => {
    expect(supportLink('https://www.patreon.com/alexochsigge')).toEqual({ url: 'https://www.patreon.com/alexochsigge', site: 'patreon.com' })
    expect(supportLink('https://ko-fi.com/show')).toEqual({ url: 'https://ko-fi.com/show', site: 'ko-fi.com' })
    expect(supportLink('http://patreon.com/x')).toBeUndefined()
    expect(supportLink('javascript:alert(1)')).toBeUndefined()
    expect(supportLink(null)).toBeUndefined()
  })
})
