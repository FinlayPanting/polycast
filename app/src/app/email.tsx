import { router } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native'
import { Button, Screen, Txt } from '../components/ui'
import { useSession } from '../lib/session'
import { space, type, usePalette } from '../theme'

export default function EmailSignIn() {
  const p = usePalette()
  const { sendEmailCode, verifyEmailCode } = useSession()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const input = [type.body, { color: p.text, backgroundColor: p.raised, borderRadius: 14, paddingHorizontal: space.md, minHeight: 52, borderWidth: 1, borderColor: p.line }]

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen edges={['top', 'bottom']} style={{ paddingHorizontal: space.lg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, gap: space.lg, paddingTop: space.xl }}>
        <Button kind="quiet" label="Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        <Txt variant="title">{sent ? 'Check your email' : 'Sign in with email'}</Txt>
        <Txt tone="quiet">{sent ? `We sent a 6-digit code to ${email}. It works for an hour.` : 'We’ll email you a code. No password needed.'}</Txt>

        {!sent ? (
          <TextInput
            style={input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={p.faint}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            accessibilityLabel="Email address"
            autoFocus
          />
        ) : (
          <TextInput
            style={[input, { letterSpacing: 6, fontSize: 24 }]}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={p.faint}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            accessibilityLabel="6-digit code"
            autoFocus
          />
        )}
        {error ? (
          <Txt variant="small" tone="saved">
            {error}
          </Txt>
        ) : null}

        <View style={{ gap: space.sm }}>
          {!sent ? (
            <Button label="Send code" busy={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onPress={() => run(async () => {
              await sendEmailCode(email.trim())
              setSent(true)
            })} />
          ) : (
            <>
              <Button label="Sign in" busy={busy} disabled={code.length !== 6} onPress={() => run(() => verifyEmailCode(email.trim(), code))} />
              <Button kind="quiet" label="Send a new code" onPress={() => run(() => sendEmailCode(email.trim()))} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
