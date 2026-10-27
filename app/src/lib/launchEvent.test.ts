import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const doc = (p: string) => new URL(`../../../docs/app-store/${p}`, import.meta.url)
const event = JSON.parse(readFileSync(doc('launch-event.json'), 'utf8'))

/** Width and height from a PNG's header, and whether it has an alpha channel. */
function png(name: string) {
  const b = readFileSync(doc(name))
  expect(b.subarray(1, 4).toString()).toBe('PNG')
  const colourType = b[25]!
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: colourType === 4 || colourType === 6 }
}

describe('launch-week App Store event (PC-1025-09)', () => {
  it("keeps to Apple's character limits", () => {
    expect(event.eventName.length).toBeLessThanOrEqual(30)
    expect(event.shortDescription.length).toBeLessThanOrEqual(50)
    expect(event.longDescription.length).toBeLessThanOrEqual(120)
    expect(['Challenge', 'Competition', 'Live Event', 'Major Update', 'New Season', 'Premiere', 'Special Event']).toContain(event.badge)
    expect(event.durationDays).toBeLessThanOrEqual(31)
  })

  it('has art at the sizes App Store Connect asks for, with no transparency', () => {
    expect(png(event.media.eventCard)).toEqual({ w: 1920, h: 1080, alpha: false })
    expect(png(event.media.eventDetails)).toEqual({ w: 1080, h: 1920, alpha: false })
    expect(png(event.media.productPageHeader)).toEqual({ w: 3840, h: 1646, alpha: false })
    expect(png(event.media.universalHeader)).toEqual({ w: 5244, h: 2950, alpha: false })
  })

  it('is written up in the App Store notes with the same text', () => {
    const notes = readFileSync(new URL('../../../docs/APP_STORE.md', import.meta.url), 'utf8')
    for (const t of [event.eventName, event.shortDescription, event.longDescription]) expect(notes).toContain(t)
  })
})
