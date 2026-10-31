import { describe, expect, it } from 'vitest'
import { EUROWAVES, FRESH_VOICES, freshVoiceWhy, LAUNCH_LANGUAGES, sameShowTitle } from '../src'

describe('Fresh voices (PC-1023-05)', () => {
  it('lists shows only for launch languages, each once', () => {
    for (const [lang, shows] of Object.entries(FRESH_VOICES)) {
      expect(LAUNCH_LANGUAGES).toContain(lang)
      const titles = shows.map((s) => s.title.toLowerCase())
      expect(new Set(titles).size).toBe(titles.length)
      for (const s of shows) expect(freshVoiceWhy(s.country, s.credit)).toMatch(/^(New voice from |Recommended by )/)
    }
    expect(FRESH_VOICES.es!.map((s) => s.title)).toContain('Ahora me entero')
    expect(FRESH_VOICES.fr!.map((s) => s.title)).toContain('STONKS! avec Arthur Perticoz')
    expect(FRESH_VOICES.pt!.map((s) => s.title)).toContain('Café Frio Show com Victor Vaz')
  })

  it('adds Eurowaves #50’s picks with a small credit (PC-1030-06)', () => {
    const picks = Object.entries(FRESH_VOICES).flatMap(([lang, shows]) => shows.filter((s) => s.credit === EUROWAVES).map((s) => `${lang}:${s.country}:${s.title}`))
    expect(picks.sort()).toEqual(['es:es:Número Mágico', 'fr:fr:Night Confessions', 'it:it:DigitMondo', 'pt:pt:Fumaça', 'pt:pt:Lar Doce Livro'])
    expect(freshVoiceWhy('it', EUROWAVES)).toBe('Recommended by Eurowaves')
    expect(freshVoiceWhy('pt')).toBe('New voice from Portugal')
  })

  it('matches titles despite case, accents and punctuation, and nothing else', () => {
    expect(sameShowTitle('Querido Pìcaro', 'Querido Pícaro')).toBe(true)
    expect(sameShowTitle('STONKS! avec Arthur Perticoz', 'Stonks avec Arthur Perticoz')).toBe(true)
    expect(sameShowTitle('NADA QUE OCULTAR', 'Nada que ocultar')).toBe(true)
    expect(sameShowTitle('Diálogos', 'Diálogos com Fulano')).toBe(false)
    expect(sameShowTitle('!!', '??')).toBe(false)
  })
})
