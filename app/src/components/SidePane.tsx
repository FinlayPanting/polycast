import type { GlossEntry, GuidanceLevel, LessonPlan, Clip } from '@polycast/core'
import { ScrollView, View } from 'react-native'
import { ENGLISH_SPEECH, speechLanguage } from '../lib/speechLanguage'
import { notesSoFar, primerWordsSoFar, savedWithMeanings } from '../lib/sidePane'
import { space, usePalette } from '../theme'
import { Txt } from './ui'

/**
 * The second pane on the open iPhone Duo (PC-1026-03): what the guide has explained so far, the primer's words
 * to listen for and the words saved this listen, beside the subtitles rather than over them.
 */
export function SidePane({
  plan,
  level,
  guided,
  position,
  guideName,
  saved,
  glossary,
  language,
  clipText,
}: {
  plan?: LessonPlan
  level: GuidanceLevel
  guided: boolean
  position: number
  guideName: string
  saved: string[]
  glossary?: Record<string, GlossEntry>
  language: string
  clipText: (c: Clip) => string
}) {
  const p = usePalette()
  const notes = guided ? notesSoFar(plan, level, position, clipText) : []
  const primer = primerWordsSoFar(plan, position)
  const kept = savedWithMeanings(saved, glossary)
  const lang = speechLanguage(language)
  return (
    <ScrollView
      accessibilityLabel={`${guideName}’s notes and your words`}
      style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: p.line }}
      contentContainerStyle={{ padding: space.lg, gap: space.lg }}
    >
      {guided ? (
        <View style={{ gap: space.sm }}>
          <Txt variant="smallStrong">{guideName}’s notes</Txt>
          {notes.length === 0 ? (
            <Txt variant="small" tone="quiet">
              What {guideName} explains will gather here as you listen.
            </Txt>
          ) : (
            notes.map((n) => (
              <View key={n.id} style={{ gap: 2 }}>
                {n.term ? (
                  <Txt variant="bodyStrong" accessibilityLanguage={lang}>
                    {n.term.text}
                  </Txt>
                ) : null}
                <Txt variant="small" tone="quiet" accessibilityLanguage={ENGLISH_SPEECH}>
                  {n.text}
                </Txt>
              </View>
            ))
          )}
        </View>
      ) : null}

      {primer.length ? (
        <View style={{ gap: space.sm }}>
          <Txt variant="smallStrong">Words to listen for</Txt>
          {primer.map((w) => (
            <View key={`${w.lemma}-${w.at}`} style={{ flexDirection: 'row', gap: space.sm, opacity: w.heard ? 1 : 0.6 }}>
              <Txt variant="bodyStrong" accessibilityLanguage={lang}>
                {w.text}
              </Txt>
              <Txt tone="quiet" style={{ flex: 1 }} accessibilityLanguage={ENGLISH_SPEECH}>
                {w.meaning}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Txt variant="smallStrong">Saved this listen</Txt>
        {kept.length === 0 ? (
          <Txt variant="small" tone="quiet">
            Tap a word in the subtitles to keep it.
          </Txt>
        ) : (
          kept.map((w) => (
            <View key={w.lemma} style={{ flexDirection: 'row', gap: space.sm }}>
              <Txt variant="bodyStrong" accessibilityLanguage={lang}>
                {w.lemma}
              </Txt>
              {w.meaning ? (
                <Txt tone="quiet" style={{ flex: 1 }} accessibilityLanguage={ENGLISH_SPEECH}>
                  {w.meaning}
                </Txt>
              ) : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}
