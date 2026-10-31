import { router } from 'expo-router'
import { Fragment, useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { KnownWordsPanel } from '../../components/KnownWordsPanel'
import { Mark } from '../../components/Mark'
import { Button, Screen, Txt } from '../../components/ui'
import { api, type KnownWordsAnswer } from '../../lib/api'
import { shouldShowKnownWords } from '../../lib/knownWords'
import { LANGUAGES } from '../../lib/languages'
import { useSession } from '../../lib/session'
import { MIN_TAP, space, usePalette } from '../../theme'

export default function ChooseLanguage() {
  const p = usePalette()
  const { profile } = useSession()
  const [choice, setChoice] = useState(profile?.target_language ?? undefined)
  // 'You already know' (PC-1022-08) appears under the language as soon as it is tapped (PC-1030-04), instead of
  // on a screen of its own. A slow or thin answer just means it doesn't appear; Continue never waits for it.
  const [known, setKnown] = useState<Record<string, KnownWordsAnswer | null>>({})
  useEffect(() => {
    if (!choice || choice in known) return
    let live = true
    api.knownWords(choice).then(
      (a) => live && setKnown((k) => ({ ...k, [choice]: a })),
      () => live && setKnown((k) => ({ ...k, [choice]: null })),
    )
    return () => {
      live = false
    }
  }, [choice, known])

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Txt variant="title" style={{ marginTop: space.xl }}>
          What are you learning?
        </Txt>
        <Txt tone="quiet">You can change this any time.</Txt>
        <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
          {LANGUAGES.map((l) => {
            const selected = choice === l.code
            const answer = selected ? known[l.code] ?? undefined : undefined
            return (
              <Fragment key={l.code}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={l.name}
                  onPress={() => setChoice(l.code)}
                  style={{
                    minHeight: MIN_TAP + 20,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingHorizontal: space.md,
                    borderRadius: 18,
                    backgroundColor: p.raised,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? p.play : p.line,
                  }}
                >
                  <Mark height={28} flagId={l.defaultFlag} accessibilityLabel="" />
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{l.name}</Txt>
                    <Txt variant="small" tone="quiet">
                      {l.native}
                    </Txt>
                  </View>
                </Pressable>
                {shouldShowKnownWords(answer) ? <KnownWordsPanel answer={answer} languageName={l.name} /> : null}
              </Fragment>
            )
          })}
        </View>
        <Txt variant="small" tone="faint">
          Polycast speaks to you in English for now.
        </Txt>
      </ScrollView>
      <View style={{ padding: space.lg }}>
        <Button
          label="Continue"
          disabled={!choice}
          // The language is saved later in onboarding: saving it is what marks onboarding as done.
          onPress={() => choice && router.push({ pathname: '/onboarding/interests', params: { language: choice } })}
        />
      </View>
    </Screen>
  )
}
