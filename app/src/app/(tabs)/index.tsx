import { SymbolView } from 'expo-symbols'
import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { LanguageSheet } from '../../components/LanguageSheet'
import { Mark } from '../../components/Mark'
import { ShelfRow } from '../../components/Shelves'
import { Button, Screen, Txt } from '../../components/ui'
import { api } from '../../lib/api'
import { guideName, languageName } from '../../lib/languages'
import { MoodPicks } from '../../components/MoodPicks'
import { useSession } from '../../lib/session'
import { greeting } from '../../lib/greeting'
import { useAsync } from '../../lib/useAsync'
import { space, usePalette } from '../../theme'
import { Loading } from '../../components/Loading'

export default function Discover() {
  const p = usePalette()
  const { profile, session, updatePrefs } = useSession()
  const [picking, setPicking] = useState(false)
  const [inEnglish, setInEnglish] = useState(false)
  // Only for a pull: the shelves kept from last time refresh quietly behind the scenes.
  const [refreshing, setRefreshing] = useState(false)
  const language = profile?.target_language ?? 'sv'
  // A hello in the language being learned, by time of day (PC-1019-09). Worked out when Discover opens.
  const meta = session?.user?.user_metadata as { full_name?: string; name?: string } | undefined
  const hello = useMemo(() => greeting(language, new Date(), meta?.full_name ?? meta?.name), [language, meta?.full_name, meta?.name])
  const { data, error, reload } = useAsync(() => api.discover(language), [language], { cacheKey: `discover:${language}` })

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void reload().finally(() => setRefreshing(false))
            }}
            tintColor={p.quiet}
          />} contentContainerStyle={{ paddingBottom: space.xxl, gap: space.xl }}>
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
          {hello ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={inEnglish ? `${hello.english}${hello.wink ? `. ${hello.wink.english}` : ''}` : `${hello.text}${hello.wink ? `. ${hello.wink.text}` : ''}`}
              accessibilityHint={inEnglish ? 'Shows it in the language you are learning' : 'Shows it in English'}
              onPress={() => setInEnglish((v) => !v)}
              hitSlop={8}
              style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
            >
              <Txt variant="heading">{inEnglish ? hello.english : hello.text}</Txt>
              {hello.wink ? <Txt tone="quiet">{inEnglish ? hello.wink.english : hello.wink.text}</Txt> : null}
            </Pressable>
          ) : null}
        </View>

        <MoodPicks key={language} language={language} guideName={guideName(profile?.guide_id)} flagId={profile?.flag_id} />

        {error && !data ? (
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            <Txt tone="quiet">{error}</Txt>
            <Button kind="secondary" label="Try again" onPress={reload} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : null}

        {!data && !error ? <Loading fill={false} /> : null}
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
