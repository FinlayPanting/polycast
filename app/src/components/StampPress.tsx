import type { SeasonStamp } from '@polycast/core'
import { BRAND } from '@polycast/core'
import * as Haptics from 'expo-haptics'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { space } from '../theme'
import { STAMP_PRESS, stampDate, stampEarnedLabel, stampPress } from '../lib/stampsCore'
import { Txt } from './ui'

/**
 * A newly earned seasonal stamp, pressed onto the wrap-up in the logo's coral, magenta and violet with one
 * gentle haptic tap (PC-1027-08). Shown once per stamp; still when Reduce Motion is on.
 */
export function StampPress({ stamp, line }: { stamp: SeasonStamp; /** The guide's line under it (PC-1030-08). */ line?: string }) {
  const reduceMotion = useReducedMotion()
  const plan = stampPress(reduceMotion)
  const scale = useSharedValue(plan.animate ? STAMP_PRESS.fromScale : 1)
  const rotate = useSharedValue(plan.animate ? STAMP_PRESS.fromRotateDeg : -4)
  const opacity = useSharedValue(plan.animate ? 0 : 1)

  useEffect(() => {
    if (plan.animate) {
      const ease = Easing.out(Easing.cubic)
      opacity.value = withTiming(1, { duration: STAMP_PRESS.pressMs / 2 })
      scale.value = withSequence(withTiming(0.94, { duration: STAMP_PRESS.pressMs, easing: Easing.in(Easing.quad) }), withTiming(1, { duration: STAMP_PRESS.settleMs, easing: ease }))
      rotate.value = withTiming(-4, { duration: STAMP_PRESS.pressMs + STAMP_PRESS.settleMs, easing: ease })
    }
    const t = setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {}), plan.tapAtMs)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }] }))

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={line ? `${stampEarnedLabel(stamp)} ${line}` : stampEarnedLabel(stamp)} style={{ alignItems: 'center', paddingVertical: space.sm, gap: space.sm }}>
      <Animated.View style={[{ borderRadius: 22, borderWidth: 2.5, borderColor: BRAND.coral, padding: 4 }, style]}>
        <View style={{ borderRadius: 18, borderWidth: 2, borderColor: BRAND.magenta, padding: 4 }}>
          <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: BRAND.violet, borderStyle: 'dashed', paddingHorizontal: space.lg, paddingVertical: space.md, alignItems: 'center', gap: 2 }}>
            <Txt variant="small" tone="quiet">
              New stamp
            </Txt>
            <Txt variant="heading">{stamp.name}</Txt>
            <Txt variant="small" tone="quiet">
              {stampDate(stamp)}
            </Txt>
          </View>
        </View>
      </Animated.View>
      {line ? (
        <Txt variant="small" tone="quiet" style={{ textAlign: 'center' }}>
          {line}
        </Txt>
      ) : null}
    </View>
  )
}
