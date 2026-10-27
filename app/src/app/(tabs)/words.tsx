import { isDue, isKnown } from '@polycast/core'
import { router, useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { FlatList, View } from 'react-native'
import { Button, Screen, Tag, Txt } from '../../components/ui'
import { languageName } from '../../lib/languages'
import { useSession } from '../../lib/session'
import { useAsync } from '../../lib/useAsync'
import { listWords } from '../../lib/words'
import { space, usePalette } from '../../theme'
import { ENGLISH_SPEECH, speechLanguage } from '../../lib/speechLanguage'

/** The word bank: everything saved while listening, with how many are due for review. */
export default function Words() {
  const p = usePalette()
  const { profile } = useSession()
  const language = profile?.target_language ?? 'sv'
  const { data, reload } = useAsync(() => listWords(language), [language])
  const speech = speechLanguage(language)
  useFocusEffect(useCallback(() => void reload(), [reload]))
  const now = new Date().toISOString()
  const due = (data ?? []).filter((w) => isDue(w.review, now))
  const free = profile?.plan !== 'plus'
  const shown = free ? (data ?? []).slice(0, 50) : (data ?? [])

  return (
    <Screen>
      <FlatList
        data={shown}
        keyExtractor={(w) => w.lemma}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Txt variant="title" accessibilityRole="header">
              Your {languageName(language)} words
            </Txt>
            {due.length ? (
              <View style={{ backgroundColor: p.raised, borderRadius: 18, padding: space.lg, gap: space.md }}>
                <Txt variant="bodyStrong">
                  {due.length === 1 ? '1 word is' : `${due.length} words are`} ready for a quick review
                </Txt>
                <Button label="Review now" onPress={() => router.push('/review')} />
              </View>
            ) : data?.length ? (
              <Txt tone="quiet">Nothing to review right now. Words come back at growing gaps, so they stick.</Txt>
            ) : null}
            {free && (data?.length ?? 0) > 50 ? (
              <Txt variant="small" tone="quiet">
                Free keeps your latest 50 words. Plus keeps them all.
              </Txt>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" accessibilityLanguage={speech}>
                {item.lemma}
              </Txt>
              <Txt variant="small" tone="quiet" accessibilityLanguage={ENGLISH_SPEECH}>
                {item.meaning}
              </Txt>
            </View>
            {isKnown(item.review) ? <Tag label="Known" tone="level" /> : null}
          </View>
        )}
        ListEmptyComponent={data ? <Txt tone="quiet">Words your guide teaches, and any you tap and save, collect here with the host’s voice saying them.</Txt> : null}
      />
    </Screen>
  )
}
