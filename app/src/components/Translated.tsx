import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, View } from 'react-native'
import { motion, space, usePalette } from '../theme'
import { Button, Txt } from './ui'

/** A soft, slow pulse while a translation is on its way. */
function Shimmer({ width }: { width: number | `${number}%` }) {
  const p = usePalette()
  const v = useRef(new Animated.Value(0.35)).current
  useEffect(() => {
    let still = false
    AccessibilityInfo.isReduceMotionEnabled().then((r) => (still = r), () => undefined)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    )
    const t = setTimeout(() => !still && loop.start(), 0)
    return () => {
      clearTimeout(t)
      loop.stop()
    }
  }, [v])
  return <Animated.View style={{ opacity: v, height: 12, width, borderRadius: 6, backgroundColor: p.line, marginTop: 4 }} accessibilityElementsHidden />
}

/**
 * A title's translation, quieter, under the original (PC-1017-T1): a soft shimmer while it's coming,
 * then it fades in. Nothing at all when there's no translation worth showing.
 */
export function TranslatedLine({ text, pending, variant = 'small' }: { text?: string; pending?: boolean; variant?: 'small' | 'body' }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (text) Animated.timing(v, { toValue: 1, duration: motion.standard, useNativeDriver: true }).start()
  }, [text, v])
  if (text)
    return (
      <Animated.View style={{ opacity: v }}>
        <Txt variant={variant} tone="quiet" numberOfLines={2}>
          {text}
        </Txt>
      </Animated.View>
    )
  return pending ? <Shimmer width="60%" /> : null
}

/**
 * A description, original first, with a tap to reveal the translation underneath (PC-1017-T1).
 * "Translating…" stands in while it's on its way.
 */
export function TranslatedDescription({ original, translation, pending, readingLanguage = 'English' }: { original: string; translation?: string; pending: boolean; readingLanguage?: string }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const long = original.length > 280
  return (
    <View style={{ gap: space.xs }}>
      <Txt numberOfLines={expanded || !long ? undefined : 5}>{original}</Txt>
      <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
        {long ? <Button kind="quiet" label={expanded ? 'Less' : 'More'} onPress={() => setExpanded((e) => !e)} style={{ paddingHorizontal: 0 }} /> : null}
        {translation || pending ? (
          <Button kind="quiet" label={open ? 'Hide translation' : `Show in ${readingLanguage}`} onPress={() => setOpen((o) => !o)} style={{ paddingHorizontal: 0 }} />
        ) : null}
      </View>
      {open ? (
        translation ? (
          <Txt tone="quiet">{translation}</Txt>
        ) : (
          <Txt tone="quiet" accessibilityLiveRegion="polite">
            Translating…
          </Txt>
        )
      ) : null}
    </View>
  )
}
