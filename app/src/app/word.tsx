import { router, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { Loading } from '../components/Loading'
import { Button, Screen, Txt } from '../components/ui'
import { useAsync } from '../lib/useAsync'
import { useHostClip } from '../lib/useHostClip'
import { ENGLISH_SPEECH, speechLanguage } from '../lib/speechLanguage'
import { wordFromLink } from '../lib/wordWidgetCore'
import { listWords } from '../lib/words'
import { space, usePalette } from '../theme'

/** One saved word, opened from the Home Screen widget (PC-1025-08), with the host saying it. */
export default function Word() {
  const p = usePalette()
  const params = useLocalSearchParams<{ lemma?: string; language?: string }>()
  const wanted = wordFromLink(params)
  const play = useHostClip()
  const { data } = useAsync(async () => (wanted ? (await listWords(wanted.language)).find((w) => w.lemma === wanted.lemma) ?? null : null), [wanted?.lemma, wanted?.language])

  const close = () => (router.canGoBack() ? router.back() : router.replace('/words'))
  return (
    <Screen edges={['top', 'bottom']} style={{ padding: space.lg, gap: space.lg }}>
      <Button kind="quiet" label="Close" onPress={close} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      {data === undefined && wanted ? <Loading fill={false} /> : null}
      {data ? (
        <View style={{ gap: space.md, backgroundColor: p.raised, borderRadius: 18, padding: space.lg }}>
          <Txt variant="title" accessibilityLanguage={speechLanguage(data.language)}>
            {data.lemma}
          </Txt>
          <Txt tone="quiet" accessibilityLanguage={ENGLISH_SPEECH}>
            {data.meaning}
          </Txt>
          <Txt accessibilityLanguage={speechLanguage(data.language)}>“{data.source.sentence}”</Txt>
          {data.audioUrl ? (
            <Button label="Hear the host say it" onPress={() => void play(data.audioUrl!, data.source.clip.start, data.source.clip.end)} />
          ) : (
            <Txt variant="small" tone="quiet">
              {data.clipGone ? 'The host’s clip went with the episode download. Download the episode again to hear it.' : 'The host’s clip isn’t available for this word.'}
            </Txt>
          )}
        </View>
      ) : data === null || !wanted ? (
        <Txt tone="quiet">That word isn’t in your words any more.</Txt>
      ) : null}
      <Button kind="secondary" label="See all your words" onPress={() => router.replace('/words')} />
    </Screen>
  )
}
