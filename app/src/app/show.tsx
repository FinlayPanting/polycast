import { goodFirstListen } from '@polycast/core'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { FlatList, Linking, Pressable, View } from 'react-native'
import { Artwork, Button, Row, Screen, Tag, Txt, minutes } from '../components/ui'
import { api, type EpisodeListing, type ShowPage } from '../lib/api'
import { followedShows, listenLater, useKept } from '../lib/keptList'
import { followId, followLabel, laterId, laterLabel } from '../lib/keptListCore'
import { autoDownloadShows, toggleAutoDownload, useAllowsMobileData } from '../lib/autoDownload'
import { AUTO_DOWNLOAD_LABEL, autoDownloadHint, autoShowId } from '../lib/autoDownloadCore'
import { useSession } from '../lib/session'
import { SUPPORT_LABEL, supportLink } from '../lib/supportShow'
import { SwitchRow } from '../components/SwitchRow'
import { useAsync } from '../lib/useAsync'
import { useTranslations } from '../lib/translate'
import { TranslatedDescription, TranslatedLine } from '../components/Translated'
import { MIN_TAP, space } from '../theme'
import { Loading } from '../components/Loading'

function published(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

/**
 * Follow a show (PC-1017-F09): its new episodes then show in the Library. Once followed, new
 * episodes can download on their own (PC-1017-F12), off until the learner turns it on.
 */
function FollowButton({ show }: { show: ShowPage['podcast'] }) {
  const follows = useKept(followedShows)
  const auto = useKept(autoDownloadShows)
  const mobileData = useAllowsMobileData()
  const { profile } = useSession()
  const following = follows.some((f) => followId(f) === show.id)
  const autoOn = auto.some((a) => autoShowId(a) === show.id)
  return (
    <View style={{ gap: space.md }}>
      <Button
        kind={following ? 'quiet' : 'secondary'}
        label={followLabel(following)}
        accessibilityHint={following ? 'Stops following this show' : 'Its new episodes will show in your Library'}
        onPress={() => {
          void followedShows.toggle({ podcastId: show.id, title: show.title, author: show.author, artwork: show.artwork, followedAt: new Date().toISOString() })
          if (following && autoOn) void autoDownloadShows.remove(show.id)
        }}
        style={{ alignSelf: 'flex-start', minWidth: 120 }}
      />
      {following ? (
        <SwitchRow label={AUTO_DOWNLOAD_LABEL} hint={autoDownloadHint(profile?.plan, mobileData)} value={autoOn} onChange={() => void toggleAutoDownload(show.id)} />
      ) : null}
    </View>
  )
}

/** Listen later from an episode row (PC-1017-F10): one tap keeps it, a second takes it out. */
function LaterToggle({ e, show }: { e: EpisodeListing; show: ShowPage['podcast'] }) {
  const later = useKept(listenLater)
  const saved = later.some((l) => laterId(l) === e.id)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={`${laterLabel(saved)}: ${e.title}`}
      hitSlop={8}
      onPress={() => void listenLater.toggle({ episodeId: e.id, title: e.title, podcastTitle: show.title, image: e.image ?? show.artwork, durationSec: e.duration_sec, addedAt: new Date().toISOString() })}
      style={({ pressed }) => ({ minHeight: MIN_TAP, justifyContent: 'center', paddingLeft: space.sm, opacity: pressed ? 0.6 : 1 })}
    >
      <Txt variant="small" tone={saved ? 'play' : 'quiet'}>
        {saved ? 'Saved' : 'Later'}
      </Txt>
    </Pressable>
  )
}

export function EpisodeRow({ e, show, firstListen = false, translation, translating }: { e: EpisodeListing; show?: ShowPage['podcast']; firstListen?: boolean; translation?: string; translating?: boolean }) {
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
      {show ? <LaterToggle e={e} show={show} /> : null}
    </Row>
  )
}

/** A show's page: its artwork, who makes it, and recent episodes with which are ready. */
export default function Show() {
  const { title: peekTitle, artwork: peekArtwork, author: peekAuthor, ...params } = useLocalSearchParams<{ appleId?: string; feedUrl?: string; podcastId?: string; title?: string; artwork?: string; author?: string }>()
  const { data, error, reload } = useAsync(() => api.openShow(params), [params.appleId, params.feedUrl, params.podcastId], { cacheKey: `show:${params.podcastId ?? params.appleId ?? params.feedUrl}` })
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
                <FollowButton show={data.podcast} />
                {data.podcast.description ? <TranslatedDescription original={data.podcast.description} translation={tr.podcastDescription} pending={tr.pending} /> : null}
                <SupportShow url={data.podcast.funding_url} />
              </>
            ) : error ? (
              <View style={{ gap: space.md }}>
                <Txt tone="quiet">{error}</Txt>
                <Button kind="secondary" label="Try again" onPress={reload} style={{ alignSelf: 'flex-start' }} />
              </View>
            ) : peekTitle ? (
              // What the list knew, at once; the episodes follow (PC-1017-F03).
              <>
                <Artwork uri={peekArtwork} size={180} radius={20} />
                <Txt variant="title" accessibilityRole="header">
                  {peekTitle}
                </Txt>
                {peekAuthor ? <Txt tone="quiet">{peekAuthor}</Txt> : null}
                <Loading label="Loading the episodes…" height={28} fill={false} />
              </>
            ) : (
              <Loading label="Loading the show…" fill={false} />
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <EpisodeRow e={item} show={data?.podcast} firstListen={item.id === firstListen} translation={tr.titles.get(item.title)} translating={tr.pending && index < 39} />
        )}
      />
    </Screen>
  )
}

/** A quiet link to the show's own support page, from its feed (PC-1018-09). Opens in Safari. */
function SupportShow({ url }: { url?: string | null }) {
  const link = supportLink(url)
  if (!link) return null
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${SUPPORT_LABEL}, on ${link.site}`}
      accessibilityHint="Opens in Safari"
      onPress={() => void Linking.openURL(link.url)}
      style={{ minHeight: MIN_TAP, justifyContent: 'center', alignSelf: 'flex-start' }}
    >
      <Txt variant="small" tone="quiet">
        {SUPPORT_LABEL} · {link.site} ↗
      </Txt>
    </Pressable>
  )
}
