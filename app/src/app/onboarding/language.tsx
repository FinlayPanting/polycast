import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Mark } from '../../components/Mark'
import { Button, Screen, Txt } from '../../components/ui'
import { LANGUAGES } from '../../lib/languages'
import { useSession } from '../../lib/session'
import { MIN_TAP, space, usePalette } from '../../theme'

export default function ChooseLanguage() {
  const p = usePalette()
  const { profile } = useSession()
  const [choice, setChoice] = useState(profile?.target_language ?? undefined)

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
            return (
              <Pressable
                key={l.code}
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
          // The language is saved on the next screen: saving it is what marks onboarding as done.
          onPress={() => choice && router.push({ pathname: '/onboarding/guidance', params: { language: choice } })}
        />
      </View>
    </Screen>
  )
}
