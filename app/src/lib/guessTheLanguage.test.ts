import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('guess the language while the guide prepares (PC-1028-06)', () => {
  const game = read('components/GuessTheLanguage.tsx')
  const episode = read('app/episode/[id].tsx')

  it('shows only while an episode is preparing, and not offline or in the demo', () => {
    const preparing = episode.slice(episode.indexOf(') : preparing ? ('), episode.indexOf("<Txt tone=\"quiet\">{cost}</Txt>"))
    expect(preparing).toContain('<GuessTheLanguage guideName={guideName(profile?.guide_id)} />')
    expect(preparing).toMatch(/offline \|\| config\.demo \? null : <GuessTheLanguage/)
  })

  it('plays an existing clip, answers in the guide’s fixed line and keeps no score', () => {
    expect(game).toContain('api\n      .guessClips()')
    expect(game).toContain('guessReply(guideName, current.language, l.code)')
    expect(game).toContain('useHostClip')
    expect(game.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/score|points|streak|AsyncStorage|api\.(mood|listen)/i)
  })

  it('does not repeat a clip it has already played until all have been heard (PC-1029-04)', () => {
    expect(game).toContain('played.current.add(guessKey(current))')
    expect(game).toContain('nextGuess(clips, current.language, Math.random, played.current)')
  })
})
