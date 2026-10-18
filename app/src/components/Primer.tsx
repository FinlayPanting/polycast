import type { Primer as PrimerData, PrimerWord } from '@polycast/core'
import { SymbolView } from 'expo-symbols'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { clockTime, playableClip } from '../lib/primer'
import { useHostClip } from '../lib/useHostClip'
import { MIN_TAP, space, usePalette } from '../theme'
import { Button, Txt } from './ui'

/**
 * The Episode Primer (PC-1017-P2, P4): what the episode is about, the words to listen for in the
 * host's own voice, and its themes. Shown on the episode screen before pressing play.
 */
export function Primer({ primer, audioUrl, languageName, onSkip }: { primer: PrimerData; audioUrl?: string; languageName: string; onSkip?: () => void }) {
  const p = usePalette()
  const [native, setNative] = useState(false)
  const play = useHostClip()
  return (
    <View style={{ gap: space.md, backgroundColor: p.raised, borderRadius: 20, padding: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <Txt variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
          Before you press play
        </Txt>
        {onSkip ? <Button kind="quiet" label="Skip and play" onPress={onSkip} style={{ paddingHorizontal: 0 }} /> : null}
      </View>

      <View style={{ gap: space.xs }}>
        <Txt>{native && primer.gistNative ? primer.gistNative : primer.gist}</Txt>
        {primer.gistNative ? (
          <Button
            kind="quiet"
            label={native ? `Show in ${languageName}` : 'Show in English'}
            onPress={() => setNative((n) => !n)}
            style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
          />
        ) : null}
      </View>

      {primer.words.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Txt variant="smallStrong" tone="quiet">
            Words to listen for
          </Txt>
          {primer.words.map((w) => (
            <WordCard key={`${w.lemma}-${w.at}`} word={w} onPlay={audioUrl && playableClip(w.clip) ? () => void play(audioUrl, w.clip.start, w.clip.end) : undefined} />
          ))}
        </View>
      ) : null}

      {primer.themes.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Txt variant="smallStrong" tone="quiet">
            What comes up
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {primer.themes.map((t) => (
              <View key={`${t.title}-${t.at}`} style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: p.line }}>
                <Txt variant="small">{t.title}</Txt>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

/** One word: the word, its meaning, and a tap to hear the host say it. */
function WordCard({ word, onPlay }: { word: PrimerWord; onPlay?: () => void }) {
  const p = usePalette()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: MIN_TAP }}>
      {onPlay ? (
        <Pressable
          onPress={onPlay}
          accessibilityRole="button"
          accessibilityLabel={`Hear the host say ${word.text}`}
          hitSlop={8}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: p.play }}
        >
          <SymbolView name="play.fill" size={14} tintColor="#FFFFFF" />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{word.text}</Txt>
        <Txt variant="small" tone="quiet">
          {word.meaning}
          {` · ${clockTime(word.at)}`}
        </Txt>
      </View>
    </View>
  )
}
