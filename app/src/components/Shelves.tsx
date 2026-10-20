import { router } from 'expo-router'
import { showPeek as peek } from '../lib/showPeek'
import { FlatList, Pressable, View } from 'react-native'
import { chartGenre, chartTag } from '@polycast/core'
import type { Shelf, ShelfEpisode } from '../lib/api'
import { space } from '../theme'
import { Artwork, minutes, Tag, Txt } from './ui'

type Show = { key: string; title: string; author?: string | null; artwork?: string | null; note?: string; why?: string; rank?: string; genre?: string; open: () => void }

function showsOf(shelf: Shelf): Show[] {
  if (!('shows' in shelf)) return []
  return (shelf.shows as any[]).map((s) => {
    if ('podcastId' in s)
      return { key: s.podcastId, title: s.title, author: s.author, artwork: s.artwork, note: s.readyEpisodes ? `${s.readyEpisodes} ready` : undefined, open: () => router.push({ pathname: '/show', params: { podcastId: s.podcastId, ...peek(s) } }) }
    if ('appleId' in s) return { key: `a${s.appleId}`, title: s.title, author: s.author, artwork: s.artwork, why: s.why, rank: chartTag(s.chart), genre: s.chart ? chartGenre(s.genres) : undefined, open: () => router.push({ pathname: '/show', params: { appleId: s.appleId, ...peek(s) } }) }
    return { key: `p${s.podcastIndexId}`, title: s.title, author: s.author, artwork: s.artwork, why: s.why, open: () => router.push({ pathname: '/show', params: { feedUrl: s.feedUrl, ...peek(s) } }) }
  })
}

const TILE = 148

function ShowTile({ show }: { show: Show }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${show.title}${show.author ? `, ${show.author}` : ''}${show.rank ? `. Number ${show.rank} in the chart` : ''}${show.genre ? `. ${show.genre}` : ''}${show.why ? `. ${show.why}` : ''}`} onPress={show.open} style={({ pressed }) => ({ width: TILE, gap: space.sm, opacity: pressed ? 0.75 : 1 })}>
      <Artwork uri={show.artwork} size={TILE} radius={14} />
      <View style={{ gap: 2 }}>
        {show.genre ? (
          <View style={{ alignSelf: 'flex-start', marginBottom: 2 }}>
            <Tag label={show.genre} tone="level" />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          {show.rank ? (
            <Txt variant="heading" tone="quiet" accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: 18, lineHeight: 20 }}>
              {show.rank}
            </Txt>
          ) : null}
          <Txt variant="smallStrong" numberOfLines={2} style={{ flexShrink: 1 }}>
            {show.title}
          </Txt>
        </View>
        {show.why ? (
          <Txt variant="small" tone="quiet" numberOfLines={2}>
            {show.why}
          </Txt>
        ) : show.note ? (
          <Txt variant="small" tone="play">
            {show.note}
          </Txt>
        ) : show.author ? (
          <Txt variant="small" tone="quiet" numberOfLines={1}>
            {show.author}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  )
}

export function EpisodeCard({ e }: { e: ShelfEpisode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${e.title}, ${e.podcastTitle}, ${minutes(e.durationSec)}, ready now`}
      onPress={() => router.push(`/episode/${e.episodeId}`)}
      style={({ pressed }) => ({ width: 208, gap: space.sm, opacity: pressed ? 0.75 : 1 })}
    >
      <Artwork uri={e.image} size={208} radius={16} />
      <Txt variant="bodyStrong" numberOfLines={2}>
        {e.title}
      </Txt>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        <Txt variant="small" tone="quiet" numberOfLines={1} style={{ flexShrink: 1 }}>
          {e.podcastTitle}, {minutes(e.durationSec)}
        </Txt>
        {e.difficulty ? <Tag label={e.difficulty.label.split(',')[0]!} tone="level" /> : null}
      </View>
    </Pressable>
  )
}

/** One shelf on Discover: a title and a sideways row of shows or ready episodes. */
export function ShelfRow({ shelf }: { shelf: Shelf }) {
  const episodes = 'episodes' in shelf ? shelf.episodes : undefined
  const shows = showsOf(shelf)
  return (
    <View style={{ gap: space.md }}>
      <Txt variant="heading" accessibilityRole="header" style={{ paddingHorizontal: space.lg }}>
        {shelf.title}
      </Txt>
      {episodes ? (
        <FlatList horizontal data={episodes} keyExtractor={(e) => e.episodeId} renderItem={({ item }) => <EpisodeCard e={item} />} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }} showsHorizontalScrollIndicator={false} />
      ) : (
        <FlatList horizontal data={shows} keyExtractor={(s) => s.key} renderItem={({ item }) => <ShowTile show={item} />} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }} showsHorizontalScrollIndicator={false} />
      )}
    </View>
  )
}
