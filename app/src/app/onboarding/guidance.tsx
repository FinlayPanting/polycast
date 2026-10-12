import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Button, Screen, Txt } from '../../components/ui'
import { GUIDANCE, GUIDES } from '../../lib/languages'
import { useSession } from '../../lib/session'
import { MIN_TAP, space, usePalette } from '../../theme'

type Level = (typeof GUIDANCE)[number]['id']

export default function ChooseGuidance() {
  const p = usePalette()
  const { language } = useLocalSearchParams<{ language: string }>()
  const { updatePrefs } = useSession()
  const [level, setLevel] = useState<Level>('standard')
  const [guide, setGuide] = useState<string>('mia')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Button kind="quiet" label="Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: space.md }} />
        <Txt variant="title">How much guidance?</Txt>
        <Txt tone="quiet">Your guide steps in at natural pauses, never over the host. You can skip any time.</Txt>
        <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
          {GUIDANCE.map((g) => {
            const selected = level === g.id
            return (
              <Pressable
                key={g.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${g.title}. ${g.line}`}
                onPress={() => setLevel(g.id)}
                style={{ minHeight: MIN_TAP, padding: space.md, borderRadius: 18, backgroundColor: p.raised, borderWidth: selected ? 2 : 1, borderColor: selected ? p.level : p.line, gap: 4 }}
              >
                <Txt variant="bodyStrong">{g.title}</Txt>
                <Txt variant="small" tone="quiet">
                  {g.line}
                </Txt>
              </Pressable>
            )
          })}
        </View>

        <Txt variant="heading" style={{ marginTop: space.md }}>
          Your guide
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup">
          {GUIDES.map((g) => {
            const selected = guide === g.id
            return (
              <Pressable
                key={g.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setGuide(g.id)}
                style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: p.raised, borderWidth: selected ? 2 : 1, borderColor: selected ? p.guide : p.line }}
              >
                <Txt variant="bodyStrong">{g.name}</Txt>
              </Pressable>
            )
          })}
        </View>
        {error ? (
          <Txt variant="small" tone="saved">
            {error}
          </Txt>
        ) : null}
      </ScrollView>
      <View style={{ padding: space.lg }}>
        <Button
          label="Start listening"
          busy={busy}
          onPress={async () => {
            setBusy(true)
            setError(undefined)
            try {
              await updatePrefs({ guidance_level: level, guide_id: guide, target_language: language, flag_id: 'polycast' })
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Couldn’t save that. Please try again.')
            } finally {
              setBusy(false)
            }
          }}
        />
      </View>
    </Screen>
  )
}
