import { router } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { LanguageSheet } from '../../components/LanguageSheet'
import { Mark } from '../../components/Mark'
import { ShelfRow } from '../../components/Shelves'
import { Button, Screen, Txt } from '../../components/ui'
import { api } from '../../lib/api'
import { languageName } from '../../lib/languages'
import { useSession } from '../../lib/session'
import { useAsync } from '../../lib/useAsync'
import { MIN_TAP, space, type, usePalette } from '../../theme'

export default function Discover() {
  const p = usePalette()
  const { profile, updatePrefs } = useSession()
  const [picking, setPicking] = useState(false)
  const language = profile?.target_language ?? 'sv'
  const { data, error, loading, reload } = useAsync(() => api.discover(language), [language])

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={reload} tintColor={p.quiet} />} contentContainerStyle={{ paddingBottom: space.xxl, gap: space.xl }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Learning ${languageName(language)}. Change language`}
            onPress={() => setPicking(true)}
            hitSlop={8}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
          >
            <Mark height={30} flagId={profile?.flag_id} accessibilityLabel="" />
            <Txt variant="title" accessibilityRole="header">
              {languageName(language)}
            </Txt>
            <SymbolView name="chevron.down" size={16} tintColor={p.quiet} />
          </Pressable>
          <Pressable
            accessibilityRole="search"
            accessibilityLabel={`Search ${languageName(language)} podcasts`}
            onPress={() => router.push('/search')}
            style={{ minHeight: MIN_TAP + 4, borderRadius: 14, backgroundColor: p.raised, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md }}
          >
            <SymbolView name="magnifyingglass" tintColor={p.faint} size={18} />
            <Txt style={[type.body, { color: p.faint }]}>Search any podcast</Txt>
          </Pressable>
        </View>

        {error && !data ? (
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            <Txt tone="quiet">{error}</Txt>
            <Button kind="secondary" label="Try again" onPress={reload} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : null}

        {data?.shelves.map((shelf) => <ShelfRow key={shelf.id} shelf={shelf} />)}

        {data && data.shelves.length === 0 ? (
          <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
            <Txt variant="heading">Nothing here yet</Txt>
            <Txt tone="quiet">Search for a show you like. Once it’s ready, it’ll be free for everyone learning {languageName(language)}.</Txt>
          </View>
        ) : null}
      </ScrollView>
      <LanguageSheet
        visible={picking}
        current={language}
        onClose={() => setPicking(false)}
        onPick={(code, flagId) => {
          setPicking(false)
          void updatePrefs({ target_language: code, flag_id: flagId }).catch(() => {})
        }}
      />
    </Screen>
  )
}
