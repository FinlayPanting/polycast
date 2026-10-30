import { Tabs } from 'expo-router'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import type { ColorValue } from 'react-native'
import { font, usePalette } from '../../theme'

const icon = (name: SFSymbol) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} tintColor={color} size={24} />
  }

export default function TabsLayout() {
  const p = usePalette()
  return (
    <Tabs
      // The tabs are drawn by BottomBar in the root layout, so they stay on every screen (PC-1017-F04).
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.text,
        tabBarInactiveTintColor: p.faint,
        tabBarStyle: { backgroundColor: p.bg, borderTopColor: p.line },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Discover', tabBarIcon: icon('safari') }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: icon('headphones') }} />
      <Tabs.Screen name="words" options={{ title: 'Words', tabBarIcon: icon('text.book.closed') }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('person.crop.circle') }} />
    </Tabs>
  )
}
