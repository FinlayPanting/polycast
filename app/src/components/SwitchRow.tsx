import { Switch, View } from 'react-native'
import { space, usePalette } from '../theme'
import { Txt } from './ui'

/** A setting that's on or off, with a quiet line saying what it does. */
export function SwitchRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt>{label}</Txt>
        {hint ? (
          <Txt variant="small" tone="quiet">
            {hint}
          </Txt>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: p.play }} accessibilityLabel={label} accessibilityHint={hint} />
    </View>
  )
}
