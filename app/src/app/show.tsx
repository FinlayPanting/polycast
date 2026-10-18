import { goodFirstListen } from '@polycast/core'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { FlatList, View } from 'react-native'
import { Artwork, Button, Row, Screen, Tag, Txt, minutes } from '../components/ui'
import { api, type EpisodeListing } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useTranslations } from '../lib/translate'
import { TranslatedDescription, TranslatedLine } from '../components/Translated'
import { space } from '../theme'
import { Loading } from '../components/Loading'

function published(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

export function EpisodeRow({ e, firstListen = false, translation, translating }: { e: EpisodeListing; firstListen?: boolean; translation?: string; translating?: boolean }) {
  const date = published(e.published)
  return (
    <Row accessibilityLabel={`${e.title}, ${minutes(e.duration_sec)}${e.status === 'ready' ? ', ready now' : ''}${firstListen ? ', good first listen' : ''}`} onPress={() => router.push(`/episode/${e.id}`)}>
      <View style={{ flex: 1, gap: 4, paddingVertical: space.xs }}>
        <Txt variant="bodyStrong" numberOfLines={2}>
          {e.title}
        </Txt>
        <TranslatedLine text={translation} pending={translating} />
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <Txt variant="small" tone="quiet">
            {[date, minutes(e.duration_sec)].filter(Boolean).join(', ')}
          </Txt>
          {firstListen ? <Tag label="Good first listen" tone="saved" /> : null}
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
  // One recent episode a new learner can finish in a sitting, so their first listen reaches the wrap-up.
  const firstListen = useMemo(() => (data ? goodFirstListen(data.episodes) : undefined), [data])
  // Titles and the description in the learner's language, shared and cached on the server (PC-1017-T1).
  const tr = useTranslations({ titles: data ? [data.podcast.title, ...data.episodes.map((e) => e.title)] : [], podcastId: data?.podcast.description ? data.podcast.id : undefined }, Boolean(data))

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
                <View>
                  <Txt variant="title" accessibilityRole="header">
                    {data.podcast.title}
                  </Txt>
                  <TranslatedLine text={tr.titles.get(data.podcast.title)} pending={tr.pending} variant="body" />
                </View>
                {data.podcast.author ? <Txt tone="quiet">{data.podcast.author}</Txt> : null}
                {data.podcast.description ? <TranslatedDescription original={data.podcast.description} translation={tr.podcastDescription} pending={tr.pending} /> : null}
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
        renderItem={({ item, index }) => (
          <EpisodeRow e={item} firstListen={item.id === firstListen} translation={tr.titles.get(item.title)} translating={tr.pending && index < 39} />
        )}
      />
    </Screen>
  )
}
