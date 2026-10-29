import { router } from 'expo-router'
import { View } from 'react-native'
import { api } from '../lib/api'
import { firstListenLabel, goodFirstListenFrom } from '../lib/emptyStart'
import { guideName } from '../lib/languages'
import { useSession } from '../lib/session'
import { useAsync } from '../lib/useAsync'
import { space } from '../theme'
import { Button, minutes, Txt } from './ui'

/**
 * The one thing to do on an empty Words or Library screen (PC-1028-10): start a good first listen in the
 * learner's language, straight into the guided listen. Shows `fallback` while there's no such episode.
 */
export function FirstListenStart({ fallback = null }: { fallback?: React.ReactNode }) {
  const { profile } = useSession()
  const language = profile?.target_language
  const { data } = useAsync(() => (language ? api.discover(language) : Promise.resolve({ shelves: [] })), [language])
  const episode = goodFirstListenFrom(data?.shelves)
  if (!episode) return <>{fallback}</>
  const guide = guideName(profile?.guide_id)
  return (
    <View style={{ gap: space.xs, alignSelf: 'stretch' }}>
      <Button
        label={firstListenLabel(guide)}
        accessibilityHint={`Plays ${episode.title} from ${episode.podcastTitle} with ${guide}`}
        onPress={() => router.push({ pathname: '/listen/[id]', params: { id: episode.episodeId, guide: '1', level: profile?.guidance_level ?? 'standard' } })}
        style={{ alignSelf: 'flex-start' }}
      />
      <Txt variant="small" tone="quiet">
        {episode.title}, {episode.podcastTitle}, {minutes(episode.durationSec)}
      </Txt>
    </View>
  )
}
