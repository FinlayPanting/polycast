import { SymbolView } from 'expo-symbols'
import { Modal, Pressable, View } from 'react-native'
import { LANGUAGES } from '../lib/languages'
import { MIN_TAP, space, usePalette } from '../theme'
import { Mark } from './Mark'
import { Txt } from './ui'

/**
 * Switch the language you're learning from the flag on Discover (the way Duolingo does it). Each
 * language shows in its own flag; picking one takes that flag too, which can be changed under You.
 */
export function LanguageSheet({ visible, current, onPick, onClose }: { visible: boolean; current: string; onPick: (code: string, flagId: string) => void; onClose: () => void }) {
  const p = usePalette()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: p.raised, padding: space.lg, paddingBottom: space.xxl, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: space.sm }}>
        <Txt variant="heading" accessibilityRole="header">
          What are you learning?
        </Txt>
        <View accessibilityRole="radiogroup" style={{ gap: space.xs }}>
          {LANGUAGES.map((l) => {
            const selected = l.code === current
            return (
              <Pressable
                key={l.code}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={l.name}
                onPress={() => (selected ? onClose() : onPick(l.code, l.defaultFlag))}
                style={({ pressed }) => ({
                  minHeight: MIN_TAP + 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  paddingHorizontal: space.md,
                  borderRadius: 16,
                  backgroundColor: pressed ? p.line : 'transparent',
                })}
              >
                <Mark height={26} flagId={l.defaultFlag} accessibilityLabel="" />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{l.name}</Txt>
                  <Txt variant="small" tone="quiet">
                    {l.native}
                  </Txt>
                </View>
                {selected ? <SymbolView name="checkmark" size={18} tintColor={p.play} /> : null}
              </Pressable>
            )
          })}
        </View>
      </View>
    </Modal>
  )
}
