import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular'
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium'
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold'
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold'
import { useFonts } from 'expo-font'
import { router, Stack } from 'expo-router'
import * as Notifications from 'expo-notifications'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { config } from '../lib/config'
import { reportFirstOpen } from '../lib/firstOpen'
import { routeForNotification } from '../lib/notificationRoute'
import { configurePurchases } from '../lib/purchases'
import { SessionProvider, useSession } from '../lib/session'
import { usePalette } from '../theme'

void SplashScreen.preventAutoHideAsync()

function Routes() {
  const { ready, session, profile } = useSession()
  const p = usePalette()
  const signedIn = Boolean(session)
  const onboarded = Boolean(profile?.target_language)

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])
  useEffect(() => {
    if (config.demo) return
    void reportFirstOpen({
      getItem: (k) => AsyncStorage.getItem(k),
      setItem: (k, v) => AsyncStorage.setItem(k, v),
      post: async () => (await fetch(`${config.apiUrl}/events/first-open`, { method: 'POST' })).ok,
    })
  }, [])
  useEffect(() => {
    if (session) configurePurchases(session.user.id)
  }, [session])
  // Tapping "your episode is ready" or "new episode is out" opens that episode's page.
  const lastResponse = Notifications.useLastNotificationResponse()
  useEffect(() => {
    if (!ready || !signedIn || !onboarded || !lastResponse) return
    const route = routeForNotification(lastResponse.notification.request.content.data)
    if (route) router.push(route as any)
  }, [ready, signedIn, onboarded, lastResponse])

  if (!ready) return null
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="email" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding/language" />
        <Stack.Screen name="onboarding/interests" />
        <Stack.Screen name="onboarding/guidance" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="search" />
        <Stack.Screen name="show" />
        <Stack.Screen name="episode/[id]" />
        <Stack.Screen name="listen/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="review" options={{ presentation: 'modal' }} />
        <Stack.Screen name="plus" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold })
  const scheme = useColorScheme()
  if (!fontsLoaded) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
          <Routes />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
