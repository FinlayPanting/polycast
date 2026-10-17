import { DEFAULT_MARK, FLAGS, needsOutline, POLE_COLOUR } from '@polycast/core'
import { useEffect } from 'react'
import { View } from 'react-native'
import { BARS, tuckedOffset } from '../lib/markGeometry'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'


export function markColours(flagId: string): [string, string, string, string] {
  const flag = FLAGS.find((f) => f.id === flagId) ?? DEFAULT_MARK
  return [POLE_COLOUR, ...flag.bars]
}

function Bar({ x, y, h, scale, colour, index, speaking, reduceMotion, arrive }: { x: number; y: number; h: number; scale: number; colour: string; index: number; speaking: boolean; reduceMotion: boolean; arrive: boolean }) {
  const level = useSharedValue(1)
  // Arriving: the stems start tucked behind the pole, peeking out below it, then slide out into the mark.
  const tucked = arrive && !reduceMotion ? tuckedOffset(BARS[index]!, index) : { dx: 0, dy: 0 }
  const dx = useSharedValue(tucked.dx)
  const dy = useSharedValue(tucked.dy)
  useEffect(() => {
    if (index === 0) return
    const ease = { duration: 560, easing: Easing.out(Easing.cubic) }
    dy.value = withDelay(500 + index * 140, withTiming(0, ease))
    dx.value = withDelay(500 + index * 140, withTiming(0, ease))
  }, [index, dx, dy])
  useEffect(() => {
    // The pole stays still; the three flag bars move like a voice when the guide speaks.
    if (speaking && index > 0 && !reduceMotion) {
      const ms = 240 + index * 70
      level.value = withDelay(
        index * 90,
        withRepeat(withSequence(withTiming(1.28, { duration: ms, easing: Easing.inOut(Easing.quad) }), withTiming(0.82, { duration: ms, easing: Easing.inOut(Easing.quad) })), -1, true),
      )
    } else {
      cancelAnimation(level)
      level.value = withTiming(1, { duration: 200 })
    }
  }, [speaking, index, reduceMotion, level])
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value * scale }, { translateY: dy.value * scale }, { scaleY: level.value }] }))
  const outline = needsOutline(colour)
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x * scale,
          top: y * scale,
          width: 14 * scale,
          height: h * scale,
          borderRadius: 7 * scale,
          backgroundColor: colour,
          borderWidth: outline ? Math.max(1, scale * 0.6) : 0,
          borderColor: '#5A5A66',
          // The pole sits in front, so tucked stems hide behind it.
          zIndex: 4 - index,
        },
        style,
      ]}
    />
  )
}

/**
 * The Polycast mark: a P, a waveform and, with a flag chosen, a flag on its pole. Its bars move while
 * the guide speaks; that's the guide's visual presence (spec: Design language).
 */
export function Mark({
  height = 48,
  flagId = DEFAULT_MARK.id,
  speaking = false,
  arrive = false,
  accessibilityLabel = 'Polycast',
}: {
  height?: number
  flagId?: string
  speaking?: boolean
  /** A small moment of delight: the stems slide out from behind the pole, then settle into the mark. */
  arrive?: boolean
  accessibilityLabel?: string
}) {
  const scale = height / 105
  const colours = markColours(flagId)
  const reduceMotion = useReducedMotion()
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: 71 * scale, height }}>
      {BARS.map((b, i) => (
        <Bar key={i} {...b} scale={scale} colour={colours[i]!} index={i} speaking={speaking} reduceMotion={reduceMotion} arrive={arrive} />
      ))}
    </View>
  )
}
