import Constants from 'expo-constants'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native'
import { FEEDBACK_LIMITS } from '@polycast/core'
import { SwitchRow } from '../components/SwitchRow'
import { Button, Screen, Txt } from '../components/ui'
import { api } from '../lib/api'
import { forgetLastScreen, lastScreen } from '../lib/lastScreen'
import { feedbackBody } from '../lib/lastScreenCore'
import { useSession } from '../lib/session'
import { space, type, usePalette } from '../theme'

/** 'Tell Finlay' (PC-1025-05): a short note, with a screenshot of the screen you were just on if you want. */
export default function Feedback() {
  const p = usePalette()
  const { profile } = useSession()
  const shot = useMemo(() => lastScreen(), [])
  const [message, setMessage] = useState('')
  const [attach, setAttach] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await api.sendFeedback(feedbackBody({ message, shot, attach, appVersion: Constants.expoConfig?.version, language: profile?.target_language }))
      forgetLastScreen()
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t send. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <Button kind="quiet" label={sent ? 'Done' : 'Cancel'} onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
          <Txt variant="title" accessibilityRole="header">
            {sent ? 'Thank you' : 'Tell Finlay'}
          </Txt>
          {sent ? (
            <Txt tone="quiet">Finlay reads every note. It’s how Polycast gets better.</Txt>
          ) : (
            <>
              <Txt tone="quiet">Something confusing, broken or lovely? A sentence is plenty.</Txt>
              <TextInput
                style={[type.body, { color: p.text, backgroundColor: p.raised, borderRadius: 14, padding: space.md, minHeight: 140, borderWidth: 1, borderColor: p.line, textAlignVertical: 'top' }]}
                value={message}
                onChangeText={setMessage}
                placeholder="What happened?"
                placeholderTextColor={p.faint}
                multiline
                maxLength={FEEDBACK_LIMITS.message}
                accessibilityLabel="Your note to Finlay"
                autoFocus
              />
              {shot ? (
                <View style={{ gap: space.md }}>
                  <SwitchRow label={`Add a screenshot of ${shot.screen}`} hint="Only this picture is sent, and only if this is on." value={attach} onChange={setAttach} />
                  {attach ? (
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${shot.base64}` }}
                      style={{ width: 120, aspectRatio: 9 / 19.5, borderRadius: 10, borderWidth: 1, borderColor: p.line }}
                      contentFit="cover"
                      accessibilityLabel={`Screenshot of ${shot.screen}`}
                    />
                  ) : null}
                </View>
              ) : null}
              {error ? <Txt tone="quiet">{error}</Txt> : null}
              <Button label="Send" busy={busy} onPress={() => void send()} disabled={!message.trim()} />
              <Txt variant="small" tone="faint">
                Sent with the app version and the language you’re learning. Kept for 90 days.
              </Txt>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}
