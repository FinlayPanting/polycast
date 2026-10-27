import { describe, expect, it } from 'vitest'
import { addressKey, clientAddress, rateLimiter } from '../src/rateLimit'

describe('rate limiter', () => {
  it('allows up to the limit per key in a window, then resets', () => {
    let t = 0
    const limit = rateLimiter(2, 1000, () => t)
    expect([limit.hit('a'), limit.hit('a'), limit.hit('a')]).toEqual([true, true, false])
    expect(limit.hit('b')).toBe(true)
    t = 1000
    expect(limit.hit('a')).toBe(true)
  })

  it('keeps memory bounded when many keys arrive', () => {
    const limit = rateLimiter(1, 60_000, () => 0, 3)
    for (const k of ['a', 'b', 'c', 'd', 'e']) expect(limit.hit(k)).toBe(true)
    // 'a' was dropped to make room, so it starts afresh; 'e' is still remembered.
    expect(limit.hit('a')).toBe(true)
    expect(limit.hit('e')).toBe(false)
  })
})

describe('client address', () => {
  const headers = (h: Record<string, string>) => (n: string) => h[n]
  it('prefers the edge’s X-Real-IP, then the last forwarded entry', () => {
    expect(clientAddress(headers({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4')
    expect(clientAddress(headers({ 'x-forwarded-for': 'made-up, 5.6.7.8' }))).toBe('5.6.7.8')
    expect(clientAddress(headers({}))).toBe('unknown')
  })
})

describe('address key (PC-1025-03)', () => {
  it('counts IPv6 callers by their /64 block, however the address is written', () => {
    const block = addressKey('2001:db8:abcd:12::1')
    expect(block).toBe('2001:db8:abcd:12::/64')
    expect(addressKey('2001:0db8:abcd:0012:ffff:1:2:3')).toBe(block)
    expect(addressKey('[2001:DB8:ABCD:12::beef]')).toBe(block)
    expect(addressKey('2001:db8:abcd:13::1')).not.toBe(block)
    expect(addressKey('fe80::1%en0')).toBe('fe80:0:0:0::/64')
  })
  it('keeps IPv4 addresses whole, including IPv4 written as IPv6', () => {
    expect(addressKey('203.0.113.7')).toBe('203.0.113.7')
    expect(addressKey('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(addressKey('unknown')).toBe('unknown')
  })
})
