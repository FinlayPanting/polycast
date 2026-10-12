import { router } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
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
  const { profile } = useSession()
  const language = profile?.target_language ?? 'sv'
  const { data, error, loading, reload } = useAsync(() => api.discover(language), [language])

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={reload} tintColor={p.quiet} />} contentContainerStyle={{ paddingBottom: space.xxl, gap: space.xl }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Mark height={30} flagId={profile?.flag_id} />
            <Txt variant="title" accessibilityRole="header">
              {languageName(language)}
            </Txt>
          </View>
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
    </Screen>
  )
}
