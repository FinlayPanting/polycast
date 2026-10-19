import { describe, expect, it } from 'vitest'
import { base64ToBytes, bottomOf, CARD, cardLayout, wrapText } from './shareCard'

const line = { text: 'Det är inte så farligt som det låter, faktiskt.', translation: "It's not as bad as it sounds, actually.", start: 12 }

describe('a shared line as a picture', () => {
  it('wraps at spaces without passing the width', () => {
    const lines = wrapText('Det är inte så farligt som det låter', 12)
    expect(lines).toEqual(['Det är inte', 'så farligt', 'som det', 'låter'])
    expect(lines.every((l) => l.length <= 12)).toBe(true)
  })

  it('cuts a word longer than a line rather than overflowing', () => {
    const lines = wrapText('Donaudampfschifffahrtsgesellschaft ja', 10)
    expect(lines.every((l) => l.length <= 10)).toBe(true)
    expect(lines.join(' ').replace(/- /g, '')).toBe('Donaudampfschifffahrtsgesellschaft ja')
  })

  it("puts the host's line, its meaning and credit to the show on the card, with the learner's flag", () => {
    const layout = cardLayout(line, 'Kaffe med Anna', 'se')
    expect(layout.quote.lines.join(' ')).toBe(`“${line.text}”`)
    expect(layout.meaning.lines.join(' ')).toBe(line.translation)
    expect(layout.credit.lines.join(' ')).toBe('Caught on Polycast, from Kaffe med Anna')
    expect(layout.link.lines).toEqual(['polycast.app'])
    expect(layout.mark.map((m) => m.colour)).toEqual(['#FF9C18', '#006AA7', '#FECC02', '#006AA7'])
  })

  it('falls back to the Polycast colours without a flag', () => {
    expect(cardLayout(line, 'Show').mark[1]!.colour).toBe('#FA6752')
  })

  it('keeps even the longest shareable line clear of the credit', () => {
    const long = { ...line, text: 'a'.repeat(5) + ' ' + 'ordet '.repeat(26).trim(), translation: 'the word '.repeat(30).trim() }
    const layout = cardLayout(long, 'A podcast with a really rather long name that goes on and on', 'de')
    expect(bottomOf(layout.meaning)).toBeLessThan(layout.credit.y - layout.credit.size)
    expect(bottomOf(layout.link)).toBeLessThanOrEqual(CARD.height - CARD.padding)
    expect(layout.meaning.lines.at(-1)!.endsWith('…')).toBe(true)
  })

  it('decodes the PNG bytes', () => {
    expect([...base64ToBytes('iVBORw==')]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect([...base64ToBytes('data:image/png;base64,aGk=')]).toEqual([104, 105])
    expect(new TextDecoder().decode(base64ToBytes('UG9seWNhc3Q='))).toBe('Polycast')
  })
})
