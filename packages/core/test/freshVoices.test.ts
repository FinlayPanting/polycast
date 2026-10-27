import { describe, expect, it } from 'vitest'
import { FRESH_VOICES, freshVoiceWhy, LAUNCH_LANGUAGES, sameShowTitle } from '../src'

describe('Fresh voices (PC-1023-05)', () => {
  it('lists shows only for launch languages, each once', () => {
    for (const [lang, shows] of Object.entries(FRESH_VOICES)) {
      expect(LAUNCH_LANGUAGES).toContain(lang)
      const titles = shows.map((s) => s.title.toLowerCase())
      expect(new Set(titles).size).toBe(titles.length)
      for (const s of shows) expect(freshVoiceWhy(s.country)).toMatch(/^New voice from /)
    }
    expect(FRESH_VOICES.es!.map((s) => s.title)).toContain('Ahora me entero')
    expect(FRESH_VOICES.fr!.map((s) => s.title)).toContain('STONKS! avec Arthur Perticoz')
    expect(FRESH_VOICES.pt!.map((s) => s.title)).toContain('Café Frio Show com Victor Vaz')
  })

  it('matches titles despite case, accents and punctuation, and nothing else', () => {
    expect(sameShowTitle('Querido Pìcaro', 'Querido Pícaro')).toBe(true)
    expect(sameShowTitle('STONKS! avec Arthur Perticoz', 'Stonks avec Arthur Perticoz')).toBe(true)
    expect(sameShowTitle('NADA QUE OCULTAR', 'Nada que ocultar')).toBe(true)
    expect(sameShowTitle('Diálogos', 'Diálogos com Fulano')).toBe(false)
    expect(sameShowTitle('!!', '??')).toBe(false)
  })
})
