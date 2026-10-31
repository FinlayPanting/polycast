import type { GlossEntry, Segment, Word } from '@polycast/core'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { FlatList, Modal, Pressable, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { currentLine, stamp, transcriptLines, TRANSCRIPT_EMPTY, TRANSCRIPT_HINT, TRANSCRIPT_TITLE, type TranscriptLine } from '../lib/transcript'
import { ENGLISH_SPEECH, speechLanguage } from '../lib/speechLanguage'
import { MIN_TAP, space, type, usePalette } from '../theme'
import { Txt } from './ui'

/**
 * Read the whole episode (PC-1030-03): the full transcript from the player, the host's language with the
 * translation underneath, the line being spoken picked out and kept in view, saved words underlined, and a tap
 * on any line to listen from there. Reading needs no sound, so it works for Deaf and hard-of-hearing learners.
 */
export function TranscriptSheet({
  visible,
  segments,
  words,
  position,
  saved,
  glossary,
  language,
  withTranslation,
  onJump,
  onClose,
}: {
  visible: boolean
  segments: Segment[]
  words: Word[]
  position: number
  saved: string[]
  glossary?: Record<string, GlossEntry>
  language?: string | null
  withTranslation: boolean
  onJump: (sec: number) => void
  onClose: () => void
}) {
  const p = usePalette()
  const lines = useMemo(() => transcriptLines(segments, words, { saved, glossary, language: language ?? undefined, withTranslation }), [segments, words, saved, glossary, language, withTranslation])
  const now = currentLine(segments, position)
  const list = useRef<FlatList<TranscriptLine>>(null)
  // Follow along, unless the learner has scrolled away to read ahead or look back (for eight seconds).
  const touchedAt = useRef(0)
  useEffect(() => {
    if (!visible || now < 0 || Date.now() - touchedAt.current < 8000) return
    list.current?.scrollToIndex({ index: now, viewPosition: 0.3, animated: true })
  }, [visible, now])
  const lang = speechLanguage(language)
  const renderItem = useCallback(
    ({ item, index }: { item: TranscriptLine; index: number }) => <Line line={item} active={index === now} lang={lang} onJump={onJump} />,
    [now, lang, onJump],
  )

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm, gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Txt variant="heading" accessibilityRole="header">
              {TRANSCRIPT_TITLE}
            </Txt>
            <Txt variant="small" tone="quiet">
              {TRANSCRIPT_HINT}
            </Txt>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close the transcript" onPress={onClose} hitSlop={8} style={{ width: MIN_TAP, height: MIN_TAP, alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView name="xmark.circle.fill" size={26} tintColor={p.faint} />
          </Pressable>
        </View>
        {lines.length ? (
          <FlatList
            ref={list}
            data={lines}
            keyExtractor={(l) => l.id}
            renderItem={renderItem}
            extraData={now}
            initialNumToRender={30}
            windowSize={11}
            contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.xs }}
            onScrollBeginDrag={() => (touchedAt.current = Date.now())}
            onMomentumScrollEnd={() => (touchedAt.current = Date.now())}
            // Lines aren't all the same height, so a far jump may need the list to draw that far first.
            onScrollToIndexFailed={(e) => {
              list.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: false })
              setTimeout(() => list.current?.scrollToIndex({ index: e.index, viewPosition: 0.3, animated: false }), 60)
            }}
          />
        ) : (
          <Txt tone="quiet" style={{ padding: space.lg }}>
            {TRANSCRIPT_EMPTY}
          </Txt>
        )}
      </View>
    </Modal>
  )
}

const Line = memo(function Line({ line, active, lang, onJump }: { line: TranscriptLine; active: boolean; lang?: string; onJump: (sec: number) => void }) {
  const p = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={line.label}
      accessibilityLanguage={lang}
      accessibilityHint="Listens from this line"
      accessibilityState={{ selected: active }}
      onPress={() => onJump(line.start)}
      style={({ pressed }) => ({
        paddingVertical: space.sm,
        paddingHorizontal: space.sm,
        marginHorizontal: -space.sm,
        borderRadius: 12,
        backgroundColor: active ? p.raised : 'transparent',
        borderLeftWidth: 3,
        borderLeftColor: active ? p.play : 'transparent',
        opacity: pressed ? 0.7 : 1,
        gap: 2,
      })}
    >
      <Text style={[type.small, { color: p.faint }]}>{stamp(line.start)}</Text>
      <Text style={[type.body, { color: active ? p.text : p.quiet }]}>
        {line.pieces.map((w, k) => (
          <Text key={w.index} style={w.saved ? { color: p.savedText, textDecorationLine: 'underline', textDecorationColor: p.saved } : undefined}>
            {w.text}
            {k < line.pieces.length - 1 ? ' ' : ''}
          </Text>
        ))}
      </Text>
      {line.translation ? (
        <Text accessibilityLanguage={ENGLISH_SPEECH} style={[type.small, { color: p.faint }]}>
          {line.translation}
        </Text>
      ) : null}
    </Pressable>
  )
})
