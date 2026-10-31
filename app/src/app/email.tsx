import { router } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native'
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated'
import { Button, Screen, Txt } from '../components/ui'
import { isReviewEmail } from '../lib/reviewAccount'
import { useSession } from '../lib/session'
import { motion, space, type, usePalette } from '../theme'

export default function EmailSignIn() {
  const p = usePalette()
  const reduceMotion = useReducedMotion()
  const { sendEmailCode, verifyEmailCode, signInWithPassword } = useSession()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  // App Review's address asks for a password instead of sending a code (PC-1012-04).
  const review = isReviewEmail(email)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const input = [type.body, { letterSpacing: 0, color: p.text, backgroundColor: p.raised, borderRadius: 14, paddingHorizontal: space.md, minHeight: 52, borderWidth: 1, borderColor: p.line }]

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
        {/* One screen for the address and the code (PC-1030-04): the code field slides in under the address. */}
        <Txt variant="title">Sign in with email</Txt>
        <Txt tone="quiet">We’ll email you a code. No password needed.</Txt>

        <TextInput
          style={input}
          value={email}
          onChangeText={(t) => {
            setEmail(t)
            // A different address needs a new code.
            if (sent) (setSent(false), setCode(''))
          }}
          placeholder="you@example.com"
          placeholderTextColor={p.faint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          accessibilityLabel="Email address"
          autoFocus={!sent}
        />
        {sent ? (
          <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(motion.standard)} style={{ gap: space.sm }}>
            <Txt tone="quiet" accessibilityLiveRegion="polite">{`We sent a 6-digit code to ${email.trim()}. It works for an hour.`}</Txt>
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
          </Animated.View>
        ) : null}
        {!sent && review ? (
          <TextInput
            style={input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={p.faint}
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            secureTextEntry
            accessibilityLabel="Password"
          />
        ) : null}
        {error ? (
          <Txt variant="small" tone="saved">
            {error}
          </Txt>
        ) : null}

        <View style={{ gap: space.sm }}>
          {!sent && review ? (
            <Button label="Sign in" busy={busy} disabled={password.length === 0} onPress={() => run(() => signInWithPassword(email.trim().toLowerCase(), password))} />
          ) : !sent ? (
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
