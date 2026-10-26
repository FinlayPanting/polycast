import { router, useSegments } from 'expo-router'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useRef } from 'react'
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlayer } from '../player/PlayerProvider'
import { activeTab, barVisible, TABS, type TabId } from '../lib/bottomBar'
import { pictureScreen } from '../lib/lastScreen'
import { shouldPicture } from '../lib/lastScreenCore'
import { screenName } from '@polycast/core'
import { font, MIN_TAP, space, usePalette } from '../theme'
import { Artwork, Txt } from './ui'

/**
 * Spotify's pattern (PC-1017-F04): the tabs stay at the bottom of every screen, and a mini-player
 * sits just above them whenever something is playing or paused, or the last episode is waiting to
 * carry on (PC-1017-F02). Tap it for the full player; swipe the full player down to come back.
 */
export function BottomBar() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const segments = useSegments() as string[]
  const lastTab = useRef<TabId>('index')
  const current = activeTab(segments, lastTab.current)
  lastTab.current = current
  if (!barVisible(segments, Platform.OS)) return null

  const go = async (tab: TabId) => {
    const href = TABS.find((t) => t.id === tab)!.href
    // Heading into You: picture the screen being left first, in case the learner wants to tell Finlay about it (PC-1025-05).
    if (shouldPicture(tab, current, segments[0] === '(tabs)')) await pictureScreen(screenName(segments))
    // From a screen pushed over the tabs (a show, an episode, search), go back down to the tabs first.
    if (segments[0] !== '(tabs)' && router.canDismiss()) router.dismissAll()
    router.navigate(href as any)
  }

  return (
    <View style={{ backgroundColor: p.bg, borderTopWidth: 0.5, borderTopColor: p.line, paddingBottom: insets.bottom }}>
      <MiniPlayer />
      <View accessibilityRole="tablist" style={{ flexDirection: 'row' }}>
        {TABS.map((t) => {
          const on = t.id === current
          const colour = on ? p.text : p.faint
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.title}
              onPress={() => void go(t.id)}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 49, paddingTop: 6, gap: 2, opacity: pressed ? 0.6 : 1 })}
            >
              <SymbolView name={t.icon as SFSymbol} tintColor={colour} size={24} />
              <Text style={{ fontFamily: font.medium, fontSize: 11, color: colour }}>{t.title}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function MiniPlayer() {
  const p = usePalette()
  const player = usePlayer()
  const v = player.mini
  if (v.kind === 'hidden') return null
  const openFull = () => {
    if (v.kind === 'live') router.push({ pathname: '/listen/[id]', params: { id: v.id, ...(player.params?.guide === '0' ? { guide: '0' } : { guide: '1' }), ...(player.params?.level ? { level: player.params.level } : {}) } })
    else player.toggle()
  }
  const playing = v.kind === 'live' && v.playing
  const loading = v.kind === 'live' && v.loading
  const label = v.kind === 'live' && v.finished ? 'Finished' : v.podcastTitle
  return (
    <View style={{ marginHorizontal: space.sm, marginTop: space.sm, marginBottom: 2, borderRadius: 12, backgroundColor: p.raised, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${v.title}, ${v.podcastTitle}. ${v.kind === 'resume' ? 'Carry on listening' : 'Open the player'}`}
          onPress={openFull}
          style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, opacity: pressed ? 0.7 : 1 })}
        >
          <Artwork uri={v.image} size={40} radius={6} />
          <View style={{ flex: 1 }}>
            <Txt variant="smallStrong" numberOfLines={1}>
              {v.title}
            </Txt>
            <Txt variant="small" tone="quiet" numberOfLines={1}>
              {label}
            </Txt>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Loading' : playing ? 'Pause' : 'Play'}
          disabled={loading || (v.kind === 'live' && v.finished)}
          onPress={() => (v.kind === 'live' && v.finished ? undefined : player.toggle())}
          hitSlop={6}
          style={({ pressed }) => ({ width: MIN_TAP + 8, height: 56, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          {loading ? <ActivityIndicator color={p.quiet} /> : <SymbolView name={playing ? 'pause.fill' : 'play.fill'} tintColor={p.text} size={22} />}
        </Pressable>
      </View>
      <View style={{ height: 2, backgroundColor: p.line }}>
        <View style={{ height: 2, width: `${v.progress * 100}%`, backgroundColor: p.play }} />
      </View>
    </View>
  )
}
