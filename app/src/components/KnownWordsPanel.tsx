import { SymbolView } from 'expo-symbols'
import { Pressable, View } from 'react-native'
import type { KnownWordsAnswer } from '../lib/api'
import { knownWordsHeading, knownWordsIntro } from '../lib/knownWords'
import { playableClip } from '../lib/primer'
import { useHostClip } from '../lib/useHostClip'
import { MIN_TAP, space, usePalette } from '../theme'
import { Txt } from './ui'

/**
 * "You already know these words" (PC-1022-08), shown on the language screen as soon as a language is tapped
 * (PC-1030-04) rather than as a screen of its own: five words from a starter episode that look like English,
 * each tapped to hear the host say it.
 */
export function KnownWordsPanel({ answer, languageName }: { answer: KnownWordsAnswer & { audioUrl: string }; languageName: string }) {
  const p = usePalette()
  const play = useHostClip()
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: space.sm, paddingTop: space.xs }}>
      <Txt variant="bodyStrong">{knownWordsHeading(languageName)}</Txt>
      <Txt variant="small" tone="quiet">
        {knownWordsIntro(answer.podcastTitle)}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {answer.words.map((w) => (
          <Pressable
            key={w.text}
            accessibilityRole="button"
            accessibilityLabel={`${w.text}, ${w.meaning}`}
            accessibilityHint="Plays the host saying it"
            disabled={!playableClip(w.clip)}
            onPress={() => void play(answer.audioUrl, w.clip.start, w.clip.end)}
            style={({ pressed }) => ({
              minHeight: MIN_TAP,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingLeft: space.xs + 2,
              paddingRight: space.md,
              borderRadius: 999,
              backgroundColor: p.raised,
              borderWidth: 1,
              borderColor: p.line,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: p.play }}>
              <SymbolView name="play.fill" size={11} tintColor="#FFFFFF" />
            </View>
            <View>
              <Txt variant="smallStrong">{w.text}</Txt>
              <Txt variant="small" tone="quiet">
                {w.meaning}
              </Txt>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
