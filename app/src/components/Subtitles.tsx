import { segmentAt, type Segment, type Word } from '@polycast/core'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ENGLISH_SPEECH, speechLanguage } from '../lib/speechLanguage'
import { space, type, usePalette } from '../theme'

export type SubtitleMode = 'target' | 'both' | 'none'

/**
 * Subtitles as the hero text: the line being spoken, large, with the current word lit up karaoke-style,
 * and the translation quiet underneath (spec: Transcripts and subtitles). Tap a word to look it up.
 */
export function Subtitles({
  segments,
  words,
  position,
  mode,
  oldFriends,
  onWord,
  onLineMenu,
  language,
}: {
  segments: Segment[]
  words: Word[]
  position: number
  mode: SubtitleMode
  /** Word indexes that are words learned in earlier episodes. */
  oldFriends: Set<number>
  onWord: (wordIndex: number) => void
  /** Long press on the line: its menu, with 'That looks wrong' (PC-1018-04). */
  onLineMenu?: (segment: Segment) => void
  /** The episode's language, so VoiceOver reads each line in its own accent (PC-1024-04). */
  language?: string | null
}) {
  const p = usePalette()
  const [peek, setPeek] = useState(false)
  const lang = speechLanguage(language)
  const i = segmentAt(segments, position)
  const seg = i >= 0 ? segments[i] : undefined
  const prev = i > 0 ? segments[i - 1] : undefined
  const lineWords = useMemo(() => (seg ? words.slice(seg.wordStart, seg.wordEnd).map((w, k) => ({ w, index: seg.wordStart + k })) : []), [seg, words])

  if (mode === 'none' && !peek) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Show subtitles for a moment" onPress={() => setPeek(true)} style={{ padding: space.lg, alignItems: 'center' }}>
        <Text style={[type.small, { color: p.faint }]}>Subtitles are off. Tap to peek.</Text>
      </Pressable>
    )
  }

  return (
    <Pressable onPress={() => peek && setPeek(false)} onLongPress={seg && onLineMenu ? () => onLineMenu(seg) : undefined} accessible={false} style={{ gap: space.md, paddingHorizontal: space.lg }}>
      {prev ? (
        <Text accessibilityLanguage={lang} style={[type.translation, { color: p.faint }]} numberOfLines={2}>
          {prev.text}
        </Text>
      ) : null}
      <Text
        accessibilityRole="text"
        accessibilityLabel={seg?.text}
        accessibilityLanguage={lang}
        accessibilityActions={seg && onLineMenu ? [{ name: 'report', label: 'That line looks wrong' }] : undefined}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'report' && seg && onLineMenu?.(seg)}
        style={[type.subtitle, { color: p.text }]}>
        {lineWords.map(({ w, index }, k) => {
          const speaking = position >= w.start && position < w.end + 0.08
          const friend = oldFriends.has(index)
          return (
            <Text
              key={index}
              onPress={() => onWord(index)}
              suppressHighlighting={false}
              style={{ color: speaking ? p.playText : friend ? p.savedText : p.text, textDecorationLine: friend ? 'underline' : 'none', textDecorationColor: p.saved }}
            >
              {w.text}
              {k < lineWords.length - 1 ? ' ' : ''}
            </Text>
          )
        })}
      </Text>
      {mode === 'both' && seg?.translation ? <Text accessibilityLanguage={ENGLISH_SPEECH} style={[type.translation, { color: p.quiet }]}>{seg.translation}</Text> : null}
      {!seg ? <View style={{ height: type.subtitle.lineHeight }} /> : null}
    </Pressable>
  )
}
