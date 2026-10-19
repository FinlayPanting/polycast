import type { PodcastSummary } from '@polycast/core'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { FlatList, TextInput, View } from 'react-native'
import { Artwork, Button, Row, Screen, Txt } from '../components/ui'
import { api } from '../lib/api'
import { languageName } from '../lib/languages'
import { useSession } from '../lib/session'
import { useTranslations } from '../lib/translate'
import { TranslatedLine } from '../components/Translated'
import { space, type, usePalette } from '../theme'

export default function Search() {
  const p = usePalette()
  const { profile } = useSession()
  const language = profile?.target_language ?? 'sv'
  // Arriving from the Discover bar (PC-1017-F07), the search starts with what was typed there.
  const { q: initial } = useLocalSearchParams<{ q?: string }>()
  const [q, setQ] = useState(initial ?? '')
  const [results, setResults] = useState<PodcastSummary[]>([])
  const [error, setError] = useState<string>()
  // Result titles in the learner's language, in one request per result list (PC-1017-T1).
  const tr = useTranslations({ titles: results.map((r) => r.title) }, results.length > 0)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) return setResults([])
    const t = setTimeout(async () => {
      try {
        setError(undefined)
        setResults((await api.search(query, language)).results)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search didn’t work. Please try again.')
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q, language])

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          placeholder={`Search ${languageName(language)} podcasts`}
          placeholderTextColor={p.faint}
          returnKeyType="search"
          accessibilityLabel="Search podcasts"
          // letterSpacing 0 on purpose: iOS reuses text fields, and one could keep the sign-in code's wide
          // spacing (6) if this didn't set its own.
          style={[type.body, { letterSpacing: 0, flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: p.raised, color: p.text, paddingHorizontal: space.md }]}
        />
        <Button kind="quiet" label="Cancel" onPress={() => router.back()} style={{ paddingHorizontal: space.sm }} />
      </View>
      {error ? (
        <Txt tone="quiet" style={{ paddingHorizontal: space.lg }}>
          {error}
        </Txt>
      ) : null}
      <FlatList
        data={results}
        keyExtractor={(r) => r.appleId}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
        renderItem={({ item }) => (
          <Row accessibilityLabel={`${item.title}, ${item.author}`} onPress={() => router.push({ pathname: '/show', params: { appleId: item.appleId } })}>
            <Artwork uri={item.artwork} size={60} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" numberOfLines={2}>
                {item.title}
              </Txt>
              <TranslatedLine text={tr.titles.get(item.title)} pending={tr.pending} />
              <Txt variant="small" tone="quiet" numberOfLines={1}>
                {item.author}
              </Txt>
            </View>
          </Row>
        )}
        ListEmptyComponent={
          q.trim().length >= 2 && !error ? (
            <Txt tone="quiet" style={{ paddingTop: space.lg }}>
              No shows found. Try the show’s exact name.
            </Txt>
          ) : null
        }
      />
    </Screen>
  )
}
