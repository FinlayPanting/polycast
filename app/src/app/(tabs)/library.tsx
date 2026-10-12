import { useFocusEffect } from 'expo-router'
import { router } from 'expo-router'
import { useCallback } from 'react'
import { FlatList, RefreshControl, View } from 'react-native'
import { Artwork, Button, Row, Screen, Txt, minutes } from '../../components/ui'
import { listListens } from '../../lib/data'
import { useAsync } from '../../lib/useAsync'
import { space, usePalette } from '../../theme'

/** Episodes started or finished, most recent first, with where the learner left off. */
export default function Library() {
  const p = usePalette()
  const { data, loading, reload } = useAsync(listListens, [])
  useFocusEffect(useCallback(() => void reload(), [reload]))

  return (
    <Screen>
      <FlatList
        data={data ?? []}
        keyExtractor={(r) => r.episode_id}
        refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={reload} tintColor={p.quiet} />}
        contentContainerStyle={{ padding: space.lg, gap: space.xs }}
        ListHeaderComponent={
          <Txt variant="title" accessibilityRole="header" style={{ marginBottom: space.md }}>
            Library
          </Txt>
        }
        renderItem={({ item }) => {
          const left = Math.max(0, item.episodes.duration_sec - item.position_sec)
          const status = item.finished_at ? 'Finished' : `${minutes(left)} left`
          return (
            <Row accessibilityLabel={`${item.episodes.title}, ${status}`} onPress={() => router.push(`/episode/${item.episode_id}`)}>
              <Artwork uri={item.episodes.image ?? item.episodes.podcasts.artwork} size={64} />
              <View style={{ flex: 1, gap: 4 }}>
                <Txt variant="bodyStrong" numberOfLines={2}>
                  {item.episodes.title}
                </Txt>
                <Txt variant="small" tone="quiet" numberOfLines={1}>
                  {item.episodes.podcasts.title}
                </Txt>
                {!item.finished_at ? (
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: p.line }}>
                    <View style={{ height: 3, borderRadius: 2, backgroundColor: p.play, width: `${Math.min(100, (item.position_sec / item.episodes.duration_sec) * 100)}%` }} />
                  </View>
                ) : (
                  <Txt variant="small" tone="faint">
                    Finished
                  </Txt>
                )}
              </View>
            </Row>
          )
        }}
        ListEmptyComponent={
          data ? (
            <View style={{ gap: space.md }}>
              <Txt tone="quiet">Episodes you start will appear here, so you can pick up where you left off.</Txt>
              <Button kind="secondary" label="Find something to listen to" onPress={() => router.push('/')} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : null
        }
      />
    </Screen>
  )
}
