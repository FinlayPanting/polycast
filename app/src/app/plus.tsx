import { router } from 'expo-router'
import { useState } from 'react'
import { Linking, ScrollView, View } from 'react-native'
import { Mark } from '../components/Mark'
import { Button, Screen, Txt } from '../components/ui'
import { buy, plusOffer, restore } from '../lib/purchases'
import { useSession } from '../lib/session'
import { useAsync } from '../lib/useAsync'
import { space, usePalette } from '../theme'

const WHAT_YOU_GET = [
  'Your guide on every episode, not one a week',
  'Up to 5 hours of brand-new episodes a month, from any show',
  'Your whole word bank, with spaced reviews',
]

/** Plus: €4.99 a month or €39 a year (spec: Plans), sold through the App Store. */
export default function Plus() {
  const p = usePalette()
  const { refreshProfile } = useSession()
  const { data: offer, error } = useAsync(plusOffer, [])
  const [busy, setBusy] = useState<string>()
  const [message, setMessage] = useState<string>()

  async function purchase(kind: 'monthly' | 'annual') {
    const pkg = offer?.[kind]
    if (!pkg) return
    setBusy(kind)
    setMessage(undefined)
    try {
      if (await buy(pkg)) {
        await refreshProfile()
        router.back()
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The purchase didn’t go through.')
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Button kind="quiet" label="Not now" onPress={() => router.back()} style={{ alignSelf: 'flex-end', paddingHorizontal: 0 }} />
        <Mark height={64} speaking />
        <Txt variant="title">Polycast Plus</Txt>
        <View style={{ gap: space.sm }}>
          {WHAT_YOU_GET.map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.play, marginTop: 9 }} />
              <Txt style={{ flex: 1 }}>{line}</Txt>
            </View>
          ))}
        </View>
        <Txt variant="small" tone="quiet">
          Every episode anyone has prepared stays free for everyone, Plus or not.
        </Txt>

        <View style={{ gap: space.sm }}>
          <Button label={offer?.annual ? `${offer.annual.product.priceString} a year` : '€39 a year'} busy={busy === 'annual'} disabled={!offer?.annual} onPress={() => purchase('annual')} />
          <Button kind="secondary" label={offer?.monthly ? `${offer.monthly.product.priceString} a month` : '€4.99 a month'} busy={busy === 'monthly'} disabled={!offer?.monthly} onPress={() => purchase('monthly')} />
        </View>
        {error || (offer && !offer.monthly && !offer.annual) ? (
          <Txt variant="small" tone="quiet">
            Plus isn’t available to buy on this device yet.
          </Txt>
        ) : null}
        {message ? (
          <Txt variant="small" tone="saved">
            {message}
          </Txt>
        ) : null}

        <Txt variant="small" tone="faint">
          Renews automatically until you cancel, at least 24 hours before the end of the period, in your iPhone’s Settings. Payment is taken by Apple.
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
          <Button
            kind="quiet"
            label="Restore purchases"
            onPress={async () => {
              const ok = await restore().catch(() => false)
              setMessage(ok ? undefined : 'No Plus subscription found for this Apple account.')
              if (ok) {
                await refreshProfile()
                router.back()
              }
            }}
            style={{ paddingHorizontal: 0 }}
          />
          <Button kind="quiet" label="Terms" onPress={() => Linking.openURL('https://polycast.app/terms')} style={{ paddingHorizontal: 0 }} />
          <Button kind="quiet" label="Privacy" onPress={() => Linking.openURL('https://polycast.app/privacy')} style={{ paddingHorizontal: 0 }} />
        </View>
      </ScrollView>
    </Screen>
  )
}
