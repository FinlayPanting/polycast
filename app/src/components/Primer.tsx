import type { Primer as PrimerData, PrimerWord } from '@polycast/core'
import { SymbolView } from 'expo-symbols'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, Pressable, View } from 'react-native'
import { clockTime, playableClip, primerReveal } from '../lib/primer'
import { useHostClip } from '../lib/useHostClip'
import { MIN_TAP, motion, space, usePalette } from '../theme'
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

/** Gap between each part appearing while the primer builds. */
const REVEAL_STEP_MS = 450

/** Fades and lifts a part in once it's shown: short and soft (spec: Motion and feel). */
function Appear({ shown, still, children }: { shown: boolean; still: boolean; children: ReactNode }) {
  const v = useRef(new Animated.Value(still && shown ? 1 : 0)).current
  useEffect(() => {
    if (!shown) return
    if (still) v.setValue(1)
    else Animated.timing(v, { toValue: 1, duration: motion.standard, useNativeDriver: true }).start()
  }, [shown, still, v])
  if (!shown) return null
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>{children}</Animated.View>
}

/**
 * The primer filling in on the prepare screen while Mia works (PC-1017-P3): nothing until it really
 * exists, then the gist, each word to listen for and the themes, one after another.
 */
export function PrimerBuilding({ primer, guide }: { primer?: PrimerData; guide: string }) {
  const p = usePalette()
  const steps = primerReveal(primer)
  const [shown, setShown] = useState(0)
  const [still, setStill] = useState(false)
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill, () => undefined)
  }, [])
  useEffect(() => {
    if (!steps.length) return
    if (still) return setShown(steps.length)
    if (shown >= steps.length) return
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 0 : REVEAL_STEP_MS)
    return () => clearTimeout(t)
  }, [steps.length, shown, still])
  if (!primer) return null
  const has = (step: string) => steps.indexOf(step as never) > -1 && steps.indexOf(step as never) < shown
  return (
    <View style={{ gap: space.md, backgroundColor: p.raised, borderRadius: 20, padding: space.lg }} accessibilityLiveRegion="polite">
      <Txt variant="smallStrong" tone="quiet">
        What {guide} has found so far
      </Txt>
      <Appear shown={has('gist')} still={still}>
        <Txt>{primer.gist}</Txt>
      </Appear>
      {primer.words.length > 0 && has('word:0') ? (
        <Txt variant="smallStrong" tone="quiet">
          Words to listen for
        </Txt>
      ) : null}
      {primer.words.map((w, i) => (
        <Appear key={`${w.lemma}-${w.at}`} shown={has(`word:${i}`)} still={still}>
          <WordCard word={w} />
        </Appear>
      ))}
      <Appear shown={has('themes')} still={still}>
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
      </Appear>
    </View>
  )
}
