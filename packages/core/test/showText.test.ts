import { describe, expect, it } from 'vitest'
import { checkTranslations, stripSponsorReads, translationPrompt } from '../src'

describe('show descriptions (PC-1017-T1)', () => {
  it('drops sponsor reads and hosting notices, keeping what the show is about', () => {
    const d = 'Anna och Erik pratar om vardagen i Stockholm. Avsnittet är sponsrat av Kaffebolaget, använd rabattkod FIKA. Nytt avsnitt varje fredag! Hosted on Acast. See acast.com/privacy for more information.'
    expect(stripSponsorReads(d)).toBe('Anna och Erik pratar om vardagen i Stockholm. Nytt avsnitt varje fredag!')
  })

  it('leaves a description with no adverts alone', () => {
    expect(stripSponsorReads('Un podcast sur la cuisine française. Chaque semaine, une recette')).toBe('Un podcast sur la cuisine française. Chaque semaine, une recette')
  })
})

describe('translating titles and descriptions', () => {
  it('numbers the texts in one prompt for the reading language', () => {
    const p = translationPrompt(['Tåget', 'Om   fika'], 'en')
    expect(p.prompt).toContain('0: Tåget\n1: Om fika')
    expect(p.system).toContain('English')
  })

  it('matches answers by number and leaves gaps empty', () => {
    expect(checkTranslations({ translations: [{ id: 1, text: ' About fika ' }, { id: 7, text: 'x' }, { id: 0, text: '' }] }, 2)).toEqual([null, 'About fika'])
    expect(checkTranslations('nonsense', 2)).toEqual([null, null])
  })
})
