import { DEFAULT_MARK, FLAGS, needsOutline, POLE_COLOUR } from '@polycast/core'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'

/** Bar geometry from Finlay's original mark (viewBox 71 × 105): x, y, height; each bar 14 wide. */
const BARS = [
  { x: 0, y: 0, h: 105 },
  { x: 19, y: 8, h: 67 },
  { x: 38, y: 19, h: 47 },
  { x: 57, y: 28, h: 30 },
] as const

export function markColours(flagId: string): [string, string, string, string] {
  const flag = FLAGS.find((f) => f.id === flagId) ?? DEFAULT_MARK
  return [POLE_COLOUR, ...flag.bars]
}

function Bar({ x, y, h, scale, colour, index, speaking, reduceMotion }: { x: number; y: number; h: number; scale: number; colour: string; index: number; speaking: boolean; reduceMotion: boolean }) {
  const level = useSharedValue(1)
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
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: level.value }] }))
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
export function Mark({ height = 48, flagId = DEFAULT_MARK.id, speaking = false, accessibilityLabel = 'Polycast' }: { height?: number; flagId?: string; speaking?: boolean; accessibilityLabel?: string }) {
  const scale = height / 105
  const colours = markColours(flagId)
  const reduceMotion = useReducedMotion()
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: 71 * scale, height }}>
      {BARS.map((b, i) => (
        <Bar key={i} {...b} scale={scale} colour={colours[i]!} index={i} speaking={speaking} reduceMotion={reduceMotion} />
      ))}
    </View>
  )
}
