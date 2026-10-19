import { router } from 'expo-router'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Mark } from '../components/Mark'
import { Button, Screen, Txt } from '../components/ui'
import { buyTip, tipProducts } from '../lib/purchases'
import { TIP_COPY, tipErrorMessage, tipOptions } from '../lib/tips'
import { useAsync } from '../lib/useAsync'
import { space } from '../theme'

/**
 * "Support Polycast" (PC-1017-K3): three one-off tips through in-app purchase, then a thank-you.
 * Reached from You and from the own-keys screen. Unlocks nothing; never shown unasked.
 */
export default function TipScreen() {
  const { data: products, error } = useAsync(tipProducts, [])
  const [busy, setBusy] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [thanked, setThanked] = useState(false)
  const prices = products ? new Map([...products].map(([id, p]) => [id, p.priceString])) : undefined
  const options = tipOptions(prices)
  const noneAvailable = Boolean(error) || (products !== undefined && options.every((o) => !o.available))

  if (thanked) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ flex: 1, padding: space.lg, gap: space.lg, justifyContent: 'center', alignItems: 'center' }}>
          <Mark height={72} speaking />
          <Txt variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
            {TIP_COPY.thanksTitle}
          </Txt>
          <Txt tone="quiet" style={{ textAlign: 'center' }}>
            {TIP_COPY.thanksBody}
          </Txt>
          <Button label="Done" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Button kind="quiet" label="Not now" onPress={() => router.back()} style={{ alignSelf: 'flex-end', paddingHorizontal: 0 }} />
        <Mark height={64} />
        <Txt variant="title" accessibilityRole="header">
          {TIP_COPY.title}
        </Txt>
        <Txt tone="quiet">{TIP_COPY.intro}</Txt>

        <View style={{ gap: space.sm }}>
          {options.map((o, i) => (
            <Button
              key={o.tip.productId}
              kind={i === 1 ? 'primary' : 'secondary'}
              label={o.label}
              busy={busy === o.tip.productId}
              disabled={!o.available || (busy !== undefined && busy !== o.tip.productId)}
              onPress={async () => {
                const product = products?.get(o.tip.productId)
                if (!product) return
                setBusy(o.tip.productId)
                setMessage(undefined)
                try {
                  if (await buyTip(product)) setThanked(true)
                } catch (e) {
                  setMessage(tipErrorMessage(e))
                } finally {
                  setBusy(undefined)
                }
              }}
            />
          ))}
        </View>

        {noneAvailable ? (
          <Txt variant="small" tone="quiet">
            {TIP_COPY.unavailable}
          </Txt>
        ) : null}
        {message ? (
          <Txt variant="small" tone="saved">
            {message}
          </Txt>
        ) : null}
        <Txt variant="small" tone="faint">
          {TIP_COPY.noUnlock} Payment is taken by Apple.
        </Txt>
      </ScrollView>
    </Screen>
  )
}
