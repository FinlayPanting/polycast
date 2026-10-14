import { router, useLocalSearchParams } from 'expo-router'
import { FlatList, View } from 'react-native'
import { Artwork, Button, Row, Screen, Tag, Txt, minutes } from '../components/ui'
import { api, type EpisodeListing } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { space } from '../theme'
import { Loading } from '../components/Loading'

function published(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

export function EpisodeRow({ e }: { e: EpisodeListing }) {
  const date = published(e.published)
  return (
    <Row accessibilityLabel={`${e.title}, ${minutes(e.duration_sec)}${e.status === 'ready' ? ', ready now' : ''}`} onPress={() => router.push(`/episode/${e.id}`)}>
      <View style={{ flex: 1, gap: 4, paddingVertical: space.xs }}>
        <Txt variant="bodyStrong" numberOfLines={2}>
          {e.title}
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <Txt variant="small" tone="quiet">
            {[date, minutes(e.duration_sec)].filter(Boolean).join(', ')}
          </Txt>
          {e.status === 'ready' ? <Tag label="Ready" tone="play" /> : null}
          {e.status === 'preparing' ? <Tag label="Preparing" tone="quiet" /> : null}
          {e.difficulty ? <Tag label={e.difficulty.label.split(',')[0]!} tone="level" /> : null}
        </View>
      </View>
    </Row>
  )
}

/** A show's page: its artwork, who makes it, and recent episodes with which are ready. */
export default function Show() {
  const params = useLocalSearchParams<{ appleId?: string; feedUrl?: string; podcastId?: string }>()
  const { data, error, reload } = useAsync(() => api.openShow(params), [params.appleId, params.feedUrl, params.podcastId])

  return (
    <Screen>
      <FlatList
        data={data?.episodes ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingBottom: space.lg }}>
            <Button kind="quiet" label="Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
            {data ? (
              <>
                <Artwork uri={data.podcast.artwork} size={180} radius={20} />
                <Txt variant="title" accessibilityRole="header">
                  {data.podcast.title}
                </Txt>
                {data.podcast.author ? <Txt tone="quiet">{data.podcast.author}</Txt> : null}
              </>
            ) : error ? (
              <View style={{ gap: space.md }}>
                <Txt tone="quiet">{error}</Txt>
                <Button kind="secondary" label="Try again" onPress={reload} style={{ alignSelf: 'flex-start' }} />
              </View>
            ) : (
              <Loading label="Loading the show…" fill={false} />
            )}
          </View>
        }
        renderItem={({ item }) => <EpisodeRow e={item} />}
      />
    </Screen>
  )
}
