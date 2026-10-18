import { isDue, type SavedWord } from '@polycast/core'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button, Screen, Txt } from '../components/ui'
import { useSession } from '../lib/session'
import { useAsync } from '../lib/useAsync'
import { CLIP_GONE } from '../lib/storage'
import { listWords, recordReview } from '../lib/words'
import { useHostClip } from '../lib/useHostClip'
import { space, usePalette } from '../theme'

/** A short review: hear the host say it, try to recall the meaning, then reveal. */
export default function Review() {
  const p = usePalette()
  const { session, profile } = useSession()
  const language = profile?.target_language ?? 'sv'
  const { data } = useAsync(() => listWords(language), [language])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const play = useHostClip()
  const due = (data ?? []).filter((w) => isDue(w.review, new Date().toISOString())).slice(0, 20)
  const word = due[index] as (SavedWord & { audioUrl?: string; clipGone?: boolean }) | undefined

  useEffect(() => {
    if (word?.audioUrl) void play(word.audioUrl, word.source.clip.start, word.source.clip.end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.lemma])

  async function answer(result: 'gotIt' | 'again') {
    if (session && word) await recordReview(session.user.id, word, result)
    setRevealed(false)
    setIndex((i) => i + 1)
  }

  if (data && !word) {
    return (
      <Screen edges={['top', 'bottom']} style={{ padding: space.lg, justifyContent: 'center', gap: space.md }}>
        <Txt variant="title">All done</Txt>
        <Txt tone="quiet">{index > 0 ? `You reviewed ${index} ${index === 1 ? 'word' : 'words'}. They’ll come back when they’re due again.` : 'Nothing is due right now.'}</Txt>
        <Button label="Close" onPress={() => router.back()} />
      </Screen>
    )
  }

  return (
    <Screen edges={['top', 'bottom']} style={{ padding: space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt variant="small" tone="quiet">
          {word ? `${index + 1} of ${due.length}` : ''}
        </Txt>
        <Button kind="quiet" label="Close" onPress={() => router.back()} style={{ paddingHorizontal: 0 }} />
      </View>
      {word ? (
        <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
          <Txt variant="title" style={{ fontSize: 40, lineHeight: 46 }}>
            {word.lemma}
          </Txt>
          {word.source.sentence ? (
            <Txt tone="quiet" style={{ fontStyle: 'italic' }}>
              “{word.source.sentence}”
            </Txt>
          ) : null}
          {word.audioUrl ? (
            <Button kind="secondary" label="Hear it again" onPress={() => void play(word.audioUrl!, word.source.clip.start, word.source.clip.end)} style={{ alignSelf: 'flex-start' }} />
          ) : word.clipGone ? (
            <Txt variant="small" tone="faint">
              {CLIP_GONE}
            </Txt>
          ) : null}
          {revealed ? (
            <Txt variant="heading" style={{ color: p.savedText }}>
              {word.meaning}
            </Txt>
          ) : null}
        </View>
      ) : null}
      {word ? (
        revealed ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button kind="secondary" label="Again" onPress={() => void answer('again')} style={{ flex: 1 }} />
            <Button label="Got it" onPress={() => void answer('gotIt')} style={{ flex: 1 }} />
          </View>
        ) : (
          <Button label="Show meaning" onPress={() => setRevealed(true)} />
        )
      ) : null}
    </Screen>
  )
}
