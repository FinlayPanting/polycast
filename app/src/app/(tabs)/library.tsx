import { useFocusEffect } from 'expo-router'
import { router } from 'expo-router'
import { useCallback } from 'react'
import { FlatList, RefreshControl, View } from 'react-native'
import { Artwork, Button, Row, Screen, Txt, minutes } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/useAsync'
import { space, usePalette } from '../../theme'

interface ListenRow {
  episode_id: string
  position_sec: number
  finished_at: string | null
  updated_at: string
  episodes: { title: string; duration_sec: number; image: string | null; podcasts: { title: string; artwork: string | null } }
}

/** Episodes started or finished, most recent first, with where the learner left off. */
export default function Library() {
  const p = usePalette()
  const { data, loading, reload } = useAsync(async () => {
    const { data } = await supabase
      .from('listens')
      .select('episode_id, position_sec, finished_at, updated_at, episodes(title, duration_sec, image, podcasts(title, artwork))')
      .order('updated_at', { ascending: false })
      .limit(100)
    return (data ?? []) as unknown as ListenRow[]
  }, [])
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
