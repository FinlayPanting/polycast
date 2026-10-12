import type { Clip, GuideMoment } from '@polycast/core'
import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { motion, space, type, usePalette } from '../theme'
import { Mark } from './Mark'
import { Button } from './ui'

const KIND_LABEL: Record<GuideMoment['kind'], string> = {
  warmup: 'Before you start',
  listenFor: 'Listen for',
  spotlight: 'Word spotlight',
  cultureNote: 'Culture note',
  checkpoint: 'So far',
  quickQuestion: 'Quick question',
  wrapUp: 'Wrap-up',
}

/** The guide's script for reading along, with the host's clips written out as the words they say. */
export function scriptText(m: GuideMoment, clipText: (c: Clip) => string): { text: string; spoken: boolean }[] {
  const parts: { text: string; spoken: boolean }[] = []
  let last = 0
  for (const match of m.script.matchAll(/\{clip:(\d+)\}/g)) {
    parts.push({ text: m.script.slice(last, match.index), spoken: false })
    const clip = m.clips[Number(match[1])]
    if (clip) parts.push({ text: `“${clipText(clip)}”`, spoken: true })
    last = match.index! + match[0].length
  }
  parts.push({ text: m.script.slice(last), spoken: false })
  return parts.filter((p) => p.text.length > 0)
}

/**
 * The guide stepping in: rises from the bottom as the episode fades down. Shows what the guide is
 * saying, with the host's own words picked out, and a way straight back to the episode.
 */
export function GuideCard({
  moment,
  guideName,
  flagId,
  clipText,
  answer,
  onAnswer,
  onSkip,
}: {
  moment: GuideMoment
  guideName: string
  flagId: string
  clipText: (c: Clip) => string
  answer?: { index: number; correct: boolean }
  onAnswer: (i: number) => void
  onSkip: () => void
}) {
  const p = usePalette()
  const rise = useSharedValue(40)
  const fade = useSharedValue(0)
  useEffect(() => {
    rise.value = withTiming(0, { duration: motion.standard })
    fade.value = withTiming(1, { duration: motion.standard })
  }, [moment.id, rise, fade])
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: rise.value }], opacity: fade.value }))
  const q = moment.kind === 'quickQuestion' ? moment.question : undefined

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[{ backgroundColor: p.raised, borderRadius: 24, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: p.line }, style]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Mark height={28} flagId={flagId} speaking={!q || answer === undefined} accessibilityLabel={`${guideName} is speaking`} />
        <View style={{ flex: 1 }}>
          <Text style={[type.smallStrong, { color: p.guideText }]}>{guideName}</Text>
          <Text style={[type.small, { color: p.quiet }]}>{KIND_LABEL[moment.kind]}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip and go back to the episode" onPress={onSkip} hitSlop={12} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[type.bodyStrong, { color: p.quiet }]}>Skip</Text>
        </Pressable>
      </View>

      {moment.term ? (
        <View style={{ gap: 2 }}>
          <Text style={[type.heading, { color: p.text }]}>{moment.term.text}</Text>
          <Text style={[type.body, { color: p.quiet }]}>{moment.term.meaning}</Text>
        </View>
      ) : null}

      <Text style={[type.body, { color: p.text }]}>
        {scriptText(moment, clipText).map((part, i) => (
          <Text key={i} style={part.spoken ? { color: p.savedText, fontFamily: type.bodyStrong.fontFamily } : undefined}>
            {part.text}
          </Text>
        ))}
      </Text>

      {q ? (
        <View style={{ gap: space.sm }}>
          {q.options.map((opt, i) => {
            const chosen = answer?.index === i
            const right = answer !== undefined && i === q.answerIndex
            return (
              <Button
                key={i}
                kind="secondary"
                label={opt}
                disabled={answer !== undefined && !chosen && !right}
                onPress={() => answer === undefined && onAnswer(i)}
                style={right ? { borderColor: p.play } : chosen ? { borderColor: p.saved } : undefined}
              />
            )
          })}
          {answer ? (
            <Text style={[type.bodyStrong, { color: answer.correct ? p.playText : p.savedText }]}>
              {answer.correct ? 'That’s right.' : `Not quite: it was “${q.options[q.answerIndex]}”.`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  )
}
