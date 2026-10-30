import { guessKey, guessReply, nextGuess, type GuessClip } from '@polycast/core'
import { useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '../lib/api'
import { LANGUAGES } from '../lib/languages'
import { useHostClip } from '../lib/useHostClip'
import { MIN_TAP, space, usePalette } from '../theme'
import { Mark } from './Mark'
import { Button, Txt } from './ui'

/**
 * Guess the language while the guide prepares (PC-1028-06): three seconds of a real host, then a tap on
 * the flag you think it is. The guide answers in one fixed line; nothing keeps score, and it's entirely
 * optional. Hidden when there aren't at least two languages' clips to play.
 */
export function GuessTheLanguage({ guideName }: { guideName: string }) {
  const p = usePalette()
  const play = useHostClip()
  const [clips, setClips] = useState<GuessClip[]>()
  const [current, setCurrent] = useState<GuessClip>()
  const [heard, setHeard] = useState(false)
  const [reply, setReply] = useState<string>()
  // Clips already played on this screen, so a second round of a language is a different host (PC-1029-04).
  const played = useRef(new Set<string>())

  useEffect(() => {
    let live = true
    api
      .guessClips()
      .then((r) => {
        if (!live) return
        setClips(r.clips)
        setCurrent(nextGuess(r.clips))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!clips || clips.length < 2 || !current) return null

  const listen = () => {
    setHeard(true)
    played.current.add(guessKey(current))
    void play(current.audioUrl, current.start, current.end).catch(() => {})
  }
  const another = () => {
    setReply(undefined)
    setHeard(false)
    setCurrent(nextGuess(clips, current.language, Math.random, played.current))
  }

  return (
    <View style={{ gap: space.sm, borderRadius: 18, borderWidth: 1, borderColor: p.line, padding: space.lg }}>
      <Txt variant="bodyStrong">While you wait: which language is this?</Txt>
      <Txt variant="small" tone="quiet">
        Three seconds of a real host. Have a listen, then pick a flag.
      </Txt>
      <Button kind="quiet" label={heard ? 'Hear it again' : 'Play the clip'} onPress={listen} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      {heard && !reply ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }} accessibilityRole="radiogroup">
          {LANGUAGES.map((l) => (
            <Pressable
              key={l.code}
              accessibilityRole="button"
              accessibilityLabel={l.name}
              onPress={() => setReply(guessReply(guideName, current.language, l.code))}
              style={({ pressed }) => ({ minHeight: MIN_TAP, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: p.raised, opacity: pressed ? 0.6 : 1 })}
            >
              <Mark height={16} flagId={l.defaultFlag} accessibilityLabel="" />
              <Txt variant="small">{l.name}</Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
      {reply ? (
        <View style={{ gap: space.xs }} accessibilityLiveRegion="polite">
          <Txt>{reply}</Txt>
          <Button kind="quiet" label="Another one" onPress={another} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        </View>
      ) : null}
    </View>
  )
}
