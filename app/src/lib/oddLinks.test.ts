import { describe, expect, it } from 'vitest'
// expo-router reads a link's query through query-string 7, which decodes with decode-uri-component.
import queryString from 'query-string'
// @ts-expect-error no type declarations; a plain CommonJS function
import decode from 'decode-uri-component'

/**
 * A broken Polycast link can't freeze the app (PC-1023-07). decode-uri-component 0.2.2's fallback decoder
 * slowed down with the square of a malformed link's length (GHSA-vcc3-ghjq-m6fr); the patch in
 * patches/decode-uri-component@0.2.2.patch decodes in one pass.
 */
describe('odd links', () => {
  it('decode quickly however malformed', () => {
    const started = Date.now()
    decode('%ff'.repeat(5000) + 'x'.repeat(5000))
    queryString.parse(`?id=${'%ff'.repeat(5000)}&from=${'%E0%A4%A'.repeat(2000)}`)
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('decode a 100,000-character run of %XX in linear time (GHSA-qr28-fpjm-wq7f, PC-1030-02)', () => {
    // The newer advisory: 0.5.0 and earlier slowed down with the square of a long run of percent escapes;
    // fixed in 0.5.1, whose decoder our patch ports. Doubling the run must roughly double the time, not
    // quadruple it.
    const shapes = ['%ff', '%E0%A4%A', '%C3', '%C3%A5%ff', '%F0%9F%98', '%FE%FF']
    const time = (chars: number) => {
      const started = performance.now()
      for (const s of shapes) decode('x' + s.repeat(Math.ceil(chars / s.length)) + '%')
      return performance.now() - started
    }
    time(10_000) // warm up
    const once = time(100_000)
    expect(once).toBeLessThan(1500)
    expect(time(200_000)).toBeLessThan(once * 3 + 50)
    expect(decode('%C3%A5'.repeat(50_000))).toBe('å'.repeat(50_000))
  })

  it('still open the right screen', () => {
    expect(queryString.parse('?podcastId=abc-123&title=Caf%C3%A9+Italiano')).toEqual({ podcastId: 'abc-123', title: 'Café Italiano' })
    expect(queryString.parse('?feedUrl=https%3A%2F%2Ffeeds.example.com%2Fshow.xml')).toEqual({ feedUrl: 'https://feeds.example.com/show.xml' })
    // Broken escapes are kept as written rather than throwing.
    expect(queryString.parse('?title=100%+Spanish&x=%E2%9C%93%')).toEqual({ title: '100% Spanish', x: '✓%' })
    expect(decode('%FE%FF')).toBe('��')
    expect(decode('a+b')).toBe('a b')
  })
})
