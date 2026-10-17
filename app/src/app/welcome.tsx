import * as AppleAuthentication from 'expo-apple-authentication'
import { router } from 'expo-router'
import { useState } from 'react'
import { Linking, Platform, useColorScheme, View } from 'react-native'
import { Mark } from '../components/Mark'
import { Button, Screen, Txt } from '../components/ui'
import { REAL_HOST_LINE } from '../lib/copy'
import { useSession } from '../lib/session'
import { space } from '../theme'

export default function Welcome() {
  const scheme = useColorScheme()
  const { signInWithApple } = useSession()
  const [error, setError] = useState<string>()

  return (
    <Screen edges={['top', 'bottom']} style={{ paddingHorizontal: space.lg }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
        <Mark height={96} speaking arrive />
        <Txt variant="title" style={{ fontSize: 40, lineHeight: 44 }}>
          Polycast
        </Txt>
        <Txt tone="quiet" style={{ maxWidth: 320 }}>
          Learn a language through the podcasts people there actually listen to, with subtitles and a guide at your side.
        </Txt>
        <Txt variant="small" tone="faint" style={{ maxWidth: 320 }}>
          {REAL_HOST_LINE}
        </Txt>
      </View>

      <View style={{ gap: space.md, paddingBottom: space.lg }}>
        {Platform.OS === 'ios' ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={scheme === 'light' ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={26}
            style={{ height: 52 }}
            onPress={async () => {
              setError(undefined)
              try {
                await signInWithApple()
              } catch (e: any) {
                if (e?.code !== 'ERR_REQUEST_CANCELED') setError(e instanceof Error ? e.message : 'Sign-in didn’t work. Please try again.')
              }
            }}
          />
        ) : null}
        <Button kind="secondary" label="Continue with email" onPress={() => router.push('/email')} />
        {error ? (
          <Txt variant="small" tone="saved">
            {error}
          </Txt>
        ) : null}
        <Txt variant="small" tone="faint" style={{ textAlign: 'center' }}>
          By continuing you agree to the{' '}
          <Txt variant="small" tone="quiet" onPress={() => Linking.openURL('https://polycast.app/terms')}>
            terms
          </Txt>{' '}
          and{' '}
          <Txt variant="small" tone="quiet" onPress={() => Linking.openURL('https://polycast.app/privacy')}>
            privacy policy
          </Txt>
          .
        </Txt>
      </View>
    </Screen>
  )
}
