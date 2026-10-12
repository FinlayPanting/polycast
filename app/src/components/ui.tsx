import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MIN_TAP, space, type, usePalette } from '../theme'

type Variant = keyof typeof type
type Tone = 'text' | 'quiet' | 'faint' | 'play' | 'guide' | 'saved' | 'level' | 'onAccent'

export function Txt({ variant = 'body', tone = 'text', style, ...rest }: TextProps & { variant?: Variant; tone?: Tone; style?: StyleProp<TextStyle> }) {
  const p = usePalette()
  return <Text {...rest} style={[type[variant], { color: p[tone] }, style]} maxFontSizeMultiplier={1.6} />
}

export function Screen({ children, style, edges = ['top'] }: { children: ReactNode; style?: StyleProp<ViewStyle>; edges?: ('top' | 'bottom')[] }) {
  const p = usePalette()
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: p.bg }, style]}>
      {children}
    </SafeAreaView>
  )
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  busy = false,
  disabled = false,
  icon,
  accessibilityHint,
  style,
}: {
  label: string
  onPress: () => void
  kind?: 'primary' | 'secondary' | 'quiet'
  busy?: boolean
  disabled?: boolean
  icon?: ReactNode
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
}) {
  const p = usePalette()
  const bg = kind === 'primary' ? p.play : kind === 'secondary' ? p.raised : 'transparent'
  const fg = kind === 'primary' ? p.onAccent : kind === 'secondary' ? p.text : p.quiet
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => [
        {
          minHeight: 52,
          paddingHorizontal: space.lg,
          borderRadius: 26,
          backgroundColor: bg,
          borderWidth: kind === 'secondary' ? 1 : 0,
          borderColor: p.line,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon}
      <Text style={[type.bodyStrong, { color: fg }]}>{label}</Text>
    </Pressable>
  )
}

/** A row that opens something: the whole row is the tap target. */
export function Row({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress?: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: MIN_TAP, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, opacity: pressed ? 0.7 : 1 })}
    >
      {children}
    </Pressable>
  )
}

export function Artwork({ uri, size, radius = 10 }: { uri?: string | null; size: number; radius?: number }) {
  const p = usePalette()
  return <Image source={uri ? { uri } : undefined} style={{ width: size, height: size, borderRadius: radius, backgroundColor: p.raised }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
}

/** A small rounded label, e.g. "Ready" or a level. */
export function Tag({ label, tone }: { label: string; tone: 'play' | 'level' | 'saved' | 'quiet' }) {
  const p = usePalette()
  const colour = tone === 'quiet' ? p.quiet : p[tone]
  return (
    <View style={{ borderRadius: 999, borderWidth: 1, borderColor: colour, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={[type.smallStrong, { color: colour, fontSize: 12, lineHeight: 16 }]}>{label}</Text>
    </View>
  )
}

export function Notice({ text, action }: { text: string; action?: { label: string; onPress: () => void } }) {
  const p = usePalette()
  return (
    <View style={{ backgroundColor: p.raised, borderRadius: 14, padding: space.md, gap: space.sm }}>
      <Txt variant="small" tone="quiet">
        {text}
      </Txt>
      {action ? <Button kind="quiet" label={action.label} onPress={action.onPress} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: MIN_TAP }} /> : null}
    </View>
  )
}

export function minutes(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} hr ${rest} min` : `${h} hr`
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}
