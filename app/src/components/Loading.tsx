import { View } from 'react-native'
import { useSession } from '../lib/session'
import { space } from '../theme'
import { Mark } from './Mark'
import { Txt } from './ui'

/**
 * What a learner sees while something loads: the Polycast mark, in their chosen flag, with its bars
 * moving as when the guide speaks (still, when Reduce Motion is on). Replaces blank screens and spinners.
 */
export function Loading({ label, height = 44, fill = true }: { label?: string; height?: number; fill?: boolean }) {
  const { profile } = useSession()
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
      style={[{ alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.xl }, fill ? { flex: 1 } : null]}
    >
      <Mark height={height} flagId={profile?.flag_id} speaking accessibilityLabel="" />
      {label ? <Txt tone="quiet">{label}</Txt> : null}
    </View>
  )
}
