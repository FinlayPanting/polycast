import { INTERESTS, toggleInterest } from '@polycast/core'
import { Pressable, View } from 'react-native'
import { MIN_TAP, space, usePalette } from '../theme'
import { Txt } from './ui'

/** Big interest tiles; a picked tile with chips shows them underneath, to narrow it if you like. */
export function InterestPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const p = usePalette()
  const picked = INTERESTS.filter((i) => value.includes(i.id) && i.subs.length > 0)
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {INTERESTS.map((i) => {
          const selected = value.includes(i.id)
          return (
            <Pressable
              key={i.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={i.label}
              onPress={() => onChange(toggleInterest(value, i.id))}
              style={{
                width: '48%',
                minHeight: MIN_TAP + 20,
                justifyContent: 'center',
                paddingHorizontal: space.md,
                borderRadius: 18,
                backgroundColor: p.raised,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? p.play : p.line,
              }}
            >
              <Txt variant="bodyStrong">{i.label}</Txt>
            </Pressable>
          )
        })}
      </View>
      {picked.map((i) => (
        <View key={i.id} style={{ gap: space.sm }}>
          <Txt variant="small" tone="quiet">
            {i.label}: anything in particular? Optional.
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {i.subs.map((s) => {
              const id = `${i.id}/${s.id}`
              const selected = value.includes(id)
              return (
                <Pressable
                  key={id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={s.label}
                  onPress={() => onChange(toggleInterest(value, id))}
                  style={{ minHeight: MIN_TAP, paddingHorizontal: space.md, borderRadius: 22, justifyContent: 'center', backgroundColor: p.raised, borderWidth: selected ? 2 : 1, borderColor: selected ? p.play : p.line }}
                >
                  <Txt variant="smallStrong">{s.label}</Txt>
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}
