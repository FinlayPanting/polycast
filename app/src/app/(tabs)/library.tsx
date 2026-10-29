import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { Artwork, Button, Row, Screen, Txt, minutes } from '../../components/ui'
import { listListens, type ListenRow } from '../../lib/data'
import { useAsync } from '../../lib/useAsync'
import { space, usePalette } from '../../theme'
import { Loading } from '../../components/Loading'
import { FirstListenStart } from '../../components/FirstListenStart'
import { isSavedForOffline, listSavedLessons } from '../../lib/offline'
import { LaterList } from '../../components/LaterList'
import { api } from '../../lib/api'
import { followedShows, useKept } from '../../lib/keptList'
import { runAutoDownload } from '../../lib/autoDownload'
import { useSession } from '../../lib/session'
import { carryOn, LIBRARY_SECTIONS, newEpisodes, recentShows, type NewEpisode, type RecentShow } from '../../lib/libraryCore'

const SECTION = Object.fromEntries(LIBRARY_SECTIONS.map((s) => [s.id, s])) as Record<(typeof LIBRARY_SECTIONS)[number]['id'], (typeof LIBRARY_SECTIONS)[number]>

/** Up to this many followed shows are checked for new episodes, in one call (PC-1020-02). */
const SHOWS_CHECKED = 200

/**
 * The Library, built for keeping up (PC-1017-F11): the shows listened to recently along the top,
 * where to carry on, new episodes from followed shows, Listen later and downloads.
 */
export default function Library() {
  const p = usePalette()
  const { data, loading, reload } = useAsync(listListens, [])
  const follows = useKept(followedShows)
  // Sorted, so the same follows in another order don't ask again.
  const followKey = follows.slice(0, SHOWS_CHECKED).map((f) => f.podcastId).sort().join(',')
  const fresh = useAsync(
    async () => {
      if (!followKey) return []
      return (await api.newEpisodes(followKey.split(','))).shows
    },
    [followKey],
    { cacheKey: `library:new:${followKey}` },
  )
  const [downloads, setDownloads] = useState(() => listSavedLessons())
  useFocusEffect(
    useCallback(() => {
      void reload()
      setDownloads(listSavedLessons())
    }, [reload]),
  )

  const recent = useMemo(() => recentShows(data ?? []), [data])
  const carry = useMemo(() => carryOn(data ?? []), [data])
  const started = useMemo(() => new Set((data ?? []).map((l) => l.episode_id)), [data])
  const fresher = useMemo(() => newEpisodes(fresh.data ?? [], Date.now(), started), [fresh.data, started])
  // New episodes of shows set to download on their own (PC-1017-F12), once the check is back.
  const { profile } = useSession()
  const plan = profile?.plan
  const plusUsedSec = profile?.plus_used_sec ?? 0
  useEffect(() => {
    if (!fresh.data?.length) return
    const all = newEpisodes(fresh.data, Date.now(), new Set(), { max: 50 })
    void runAutoDownload(all, plan ? { plan, plusUsedSec } : null).then(() => setDownloads(listSavedLessons()))
  }, [fresh.data, plan, plusUsedSec])

  return (
    <Screen>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={() => void Promise.all([reload(), fresh.reload()])} tintColor={p.quiet} />}
        contentContainerStyle={{ paddingVertical: space.lg, paddingBottom: space.xxl, gap: space.xl }}
      >
        <Txt variant="title" accessibilityRole="header" style={{ paddingHorizontal: space.lg }}>
          Library
        </Txt>

        {!data ? (
          <Loading fill={false} />
        ) : !data.length && !follows.length ? (
          <View style={{ gap: space.md, paddingHorizontal: space.lg }}>
            <Txt tone="quiet">Episodes you start will appear here, so you can pick up where you left off.</Txt>
            <FirstListenStart fallback={<Button kind="secondary" label="Find something to listen to" onPress={() => router.push('/')} style={{ alignSelf: 'flex-start' }} />} />
          </View>
        ) : (
          <Section title={SECTION.recent.title} empty={recent.length ? undefined : SECTION.recent.empty} flush>
            <FlatList horizontal data={recent} keyExtractor={(s) => s.podcastId} renderItem={({ item }) => <RecentTile show={item} />} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }} showsHorizontalScrollIndicator={false} />
          </Section>
        )}

        {carry.length ? (
          <Section title={SECTION['carry-on'].title}>
            {carry.map((l) => (
              <ListenItem key={l.episode_id} item={l} />
            ))}
          </Section>
        ) : null}

        <Section title={SECTION.new.title} empty={follows.length || fresher.length ? undefined : SECTION.new.empty}>
          {follows.length && !fresh.data && fresh.loading ? <Loading fill={false} height={28} /> : null}
          {follows.length && fresh.data && !fresher.length ? (
            <Txt variant="small" tone="quiet">
              Nothing new from the shows you follow in the last fortnight.
            </Txt>
          ) : null}
          {fresher.map((e) => (
            <NewItem key={e.episodeId} e={e} />
          ))}
        </Section>

        <Section title={SECTION.later.title}>
          <LaterList />
        </Section>

        <Section title={SECTION.downloads.title} empty={downloads.length ? undefined : SECTION.downloads.empty}>
          {downloads.map(({ payload: { episode: e } }) => (
            <Row key={e.id} accessibilityLabel={`${e.title}, ${e.podcastTitle}, on this phone`} onPress={() => router.push(`/episode/${e.id}`)}>
              <Artwork uri={e.image} size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong" numberOfLines={2}>
                  {e.title}
                </Txt>
                <Txt variant="small" tone="quiet" numberOfLines={1}>
                  {e.podcastTitle}, {minutes(e.durationSec)}
                </Txt>
              </View>
            </Row>
          ))}
        </Section>
      </ScrollView>
    </Screen>
  )
}

function Section({ title, empty, flush = false, children }: { title: string; empty?: string; flush?: boolean; children?: ReactNode }) {
  return (
    <View style={{ gap: space.md }}>
      <Txt variant="heading" accessibilityRole="header" style={{ paddingHorizontal: space.lg }}>
        {title}
      </Txt>
      <View style={{ paddingHorizontal: flush && !empty ? 0 : space.lg, gap: space.xs }}>
        {empty ? (
          <Txt variant="small" tone="quiet">
            {empty}
          </Txt>
        ) : (
          children
        )}
      </View>
    </View>
  )
}

const TILE = 112

function RecentTile({ show }: { show: RecentShow }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={show.title}
      onPress={() => router.push({ pathname: '/show', params: { podcastId: show.podcastId, title: show.title, artwork: show.artwork ?? '' } })}
      style={({ pressed }) => ({ width: TILE, gap: space.sm, opacity: pressed ? 0.75 : 1 })}
    >
      <Artwork uri={show.artwork} size={TILE} radius={14} />
      <Txt variant="small" numberOfLines={2}>
        {show.title}
      </Txt>
    </Pressable>
  )
}

function ListenItem({ item }: { item: ListenRow }) {
  const p = usePalette()
  const left = Math.max(0, item.episodes.duration_sec - item.position_sec)
  const status = `${minutes(left)} left${isSavedForOffline(item.episode_id) ? ' · On this phone' : ''}`
  return (
    <Row accessibilityLabel={`${item.episodes.title}, ${status}`} onPress={() => router.push(`/episode/${item.episode_id}`)}>
      <Artwork uri={item.episodes.image ?? item.episodes.podcasts.artwork} size={56} />
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="bodyStrong" numberOfLines={2}>
          {item.episodes.title}
        </Txt>
        <Txt variant="small" tone="quiet" numberOfLines={1}>
          {item.episodes.podcasts.title}, {status}
        </Txt>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: p.line }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: p.play, width: `${Math.min(100, (item.position_sec / Math.max(1, item.episodes.duration_sec)) * 100)}%` }} />
        </View>
      </View>
    </Row>
  )
}

function NewItem({ e }: { e: NewEpisode }) {
  const date = new Date(e.published).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return (
    <Row accessibilityLabel={`${e.title}, ${e.podcastTitle}, ${date}${e.ready ? ', ready now' : ''}`} onPress={() => router.push(`/episode/${e.episodeId}`)}>
      <Artwork uri={e.image} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong" numberOfLines={2}>
          {e.title}
        </Txt>
        <Txt variant="small" tone="quiet" numberOfLines={1}>
          {e.podcastTitle}, {date}, {minutes(e.durationSec)}
          {e.ready ? ' · Ready' : ''}
        </Txt>
      </View>
    </Row>
  )
}
