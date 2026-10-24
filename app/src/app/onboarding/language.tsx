import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Mark } from '../../components/Mark'
import { Button, Screen, Txt } from '../../components/ui'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { REQUESTABLE_LANGUAGES } from '@polycast/core'
import { config } from '../../lib/config'
import { LANGUAGES } from '../../lib/languages'
import { languageRequestThanks, requestLanguage } from '../../lib/languageRequest'
import { useSession } from '../../lib/session'
import { MIN_TAP, space, usePalette } from '../../theme'

export default function ChooseLanguage() {
  const p = usePalette()
  const { profile } = useSession()
  const [choice, setChoice] = useState(profile?.target_language ?? undefined)
  const [askOpen, setAskOpen] = useState(false)
  const [asked, setAsked] = useState<{ code: string; name: string } | undefined>()
  const ask = (code: string, name: string) => {
    setAsked({ code, name })
    if (config.demo) return
    void requestLanguage(code, {
      getItem: (k) => AsyncStorage.getItem(k),
      setItem: (k, v) => AsyncStorage.setItem(k, v),
      post: async (language) =>
        (await fetch(`${config.apiUrl}/events/language-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language }) })).ok,
    })
  }

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
        <View style={{ gap: space.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: askOpen }}
            onPress={() => setAskOpen((o) => !o)}
            hitSlop={8}
            style={{ minHeight: MIN_TAP, justifyContent: 'center' }}
          >
            <Txt tone="quiet">Learning something else?</Txt>
          </Pressable>
          {askOpen && asked ? (
            <Txt variant="small" tone="quiet" accessibilityLiveRegion="polite">
              {languageRequestThanks(asked.name, asked.code)}
            </Txt>
          ) : askOpen ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {REQUESTABLE_LANGUAGES.map((l) => (
                <Pressable
                  key={l.code}
                  accessibilityRole="button"
                  accessibilityLabel={l.code === 'other' ? 'Something else' : `I’d like ${l.name}`}
                  onPress={() => ask(l.code, l.name)}
                  style={({ pressed }) => ({
                    minHeight: MIN_TAP,
                    justifyContent: 'center',
                    paddingHorizontal: space.md,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: p.line,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Txt variant="small">{l.name}</Txt>
                </Pressable>
              ))}
            </View>
          ) : null}
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
          onPress={() => choice && router.push({ pathname: '/onboarding/known', params: { language: choice } })}
        />
      </View>
    </Screen>
  )
}
