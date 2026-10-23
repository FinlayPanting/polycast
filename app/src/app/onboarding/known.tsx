import { router, useLocalSearchParams } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { Button, Screen, Txt } from '../../components/ui'
import { api, type KnownWordsAnswer } from '../../lib/api'
import { knownWordsHeading, knownWordsIntro, shouldShowKnownWords } from '../../lib/knownWords'
import { languageName } from '../../lib/languages'
import { playableClip } from '../../lib/primer'
import { useHostClip } from '../../lib/useHostClip'
import { MIN_TAP, space, usePalette } from '../../theme'

/**
 * "You already know these words" (PC-1022-08): right after picking a language, five words from a
 * starter episode that look like English (Italian "importante", Swedish "musik"), each tapped to
 * hear the host say it. Skipped on its own when there aren't enough words or the answer is slow.
 */
export default function KnownWords() {
  const p = usePalette()
  const { language } = useLocalSearchParams<{ language: string }>()
  const [answer, setAnswer] = useState<KnownWordsAnswer | undefined>()
  const play = useHostClip()
  const next = () => router.replace({ pathname: '/onboarding/interests', params: { language } })

  useEffect(() => {
    let live = true
    api
      .knownWords(language)
      .then((a) => {
        if (!live) return
        if (shouldShowKnownWords(a)) setAnswer(a)
        else next()
      })
      .catch(() => live && next())
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  if (!shouldShowKnownWords(answer))
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator accessibilityLabel="Loading" />
        </View>
      </Screen>
    )

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Txt variant="title" style={{ marginTop: space.xl }}>
          {knownWordsHeading(languageName(language))}
        </Txt>
        <Txt tone="quiet">{knownWordsIntro(answer.podcastTitle)}</Txt>
        <View style={{ gap: space.sm }}>
          {answer.words.map((w) => (
            <Pressable
              key={w.text}
              accessibilityRole="button"
              accessibilityLabel={`${w.text}, ${w.meaning}`}
              accessibilityHint="Plays the host saying it"
              disabled={!playableClip(w.clip)}
              onPress={() => void play(answer.audioUrl, w.clip.start, w.clip.end)}
              style={{
                minHeight: MIN_TAP + 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingHorizontal: space.md,
                borderRadius: 18,
                backgroundColor: p.raised,
                borderWidth: 1,
                borderColor: p.line,
              }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: p.play }}>
                <SymbolView name="play.fill" size={12} tintColor="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{w.text}</Txt>
                <Txt variant="small" tone="quiet">
                  {w.meaning}
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={{ padding: space.lg }}>
        <Button label="Continue" onPress={next} />
      </View>
    </Screen>
  )
}
