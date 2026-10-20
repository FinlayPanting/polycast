import { router } from 'expo-router'
import { Pressable, View } from 'react-native'
import { listenLater, useKept } from '../lib/keptList'
import { MIN_TAP, space } from '../theme'
import { Artwork, Row, Txt, minutes } from './ui'

/** The Library's Listen later list (PC-1017-F10): newest first, each with a way to take it out. */
export function LaterList({ limit }: { limit?: number }) {
  const later = useKept(listenLater)
  const shown = limit ? later.slice(0, limit) : later
  if (!later.length)
    return (
      <Txt variant="small" tone="quiet">
        Tap Listen later on any episode to keep it here.
      </Txt>
    )
  return (
    <View style={{ gap: space.xs }}>
      {shown.map((e) => (
        <Row key={e.episodeId} accessibilityLabel={`${e.title}, ${e.podcastTitle}, ${minutes(e.durationSec)}`} onPress={() => router.push(`/episode/${e.episodeId}`)}>
          <Artwork uri={e.image} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong" numberOfLines={2}>
              {e.title}
            </Txt>
            <Txt variant="small" tone="quiet" numberOfLines={1}>
              {e.podcastTitle}, {minutes(e.durationSec)}
            </Txt>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Take ${e.title} out of Listen later`}
            hitSlop={8}
            onPress={() => void listenLater.remove(e.episodeId)}
            style={({ pressed }) => ({ minHeight: MIN_TAP, justifyContent: 'center', paddingLeft: space.sm, opacity: pressed ? 0.6 : 1 })}
          >
            <Txt variant="small" tone="quiet">
              Remove
            </Txt>
          </Pressable>
        </Row>
      ))}
    </View>
  )
}
