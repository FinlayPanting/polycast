import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Linking, ScrollView, View } from 'react-native'
import { Mark } from '../components/Mark'
import { Button, Screen, Tag, Txt } from '../components/ui'
import { buy, plusOffer, restore } from '../lib/purchases'
import { DEFAULT_ANNUAL, DEFAULT_MONTHLY, type PlanPrice, yearlyValueLine } from '../lib/planValue'
import { RESTORE_MESSAGES, restoreErrorMessage } from '../lib/plusPending'
import { useSession } from '../lib/session'
import { useAsync } from '../lib/useAsync'
import { config } from '../lib/config'
import { plusScreenVisit } from '../lib/plusScreenCount'
import { space, usePalette } from '../theme'

const WHAT_YOU_GET = [
  'Your guide on every episode, not one a week',
  'Up to 5 hours of brand-new episodes a month, from any show',
  'Your whole word bank, with spaced reviews',
]

/** Plus: €4.99 a month or €49 a year (spec: Plans; yearly raised from €39 on 19 Oct 2026), sold through the App Store. */
export default function Plus() {
  const p = usePalette()
  const { confirmPlus } = useSession()
  const { data: offer, error } = useAsync(plusOffer, [])
  const [busy, setBusy] = useState<string>()
  const [message, setMessage] = useState<string>()
  // Anonymous counts of who sees this screen and who leaves without buying (PC-1018-08).
  const visit = useRef<ReturnType<typeof plusScreenVisit>>(undefined)
  useEffect(() => {
    if (config.demo) return
    const v = plusScreenVisit((event) =>
      fetch(`${config.apiUrl}/events/plus-screen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }) }),
    )
    visit.current = v
    return () => v.close()
  }, [])
  const priceOf = (kind: 'monthly' | 'annual', fallback: PlanPrice): PlanPrice => {
    const product = offer?.[kind]?.product
    return product ? { amount: product.price, currency: product.currencyCode } : fallback
  }
  const yearlyValue = yearlyValueLine(priceOf('annual', DEFAULT_ANNUAL), priceOf('monthly', DEFAULT_MONTHLY))

  async function purchase(kind: 'monthly' | 'annual') {
    const pkg = offer?.[kind]
    if (!pkg) return
    setBusy(kind)
    setMessage(undefined)
    try {
      if (await buy(pkg)) {
        // The App Store said yes: Plus shows now, and the app keeps checking until the server agrees.
        visit.current?.becamePlus()
        confirmPlus()
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
          <View style={{ gap: space.xs }}>
            {yearlyValue ? (
              <View style={{ alignSelf: 'flex-start' }}>
                <Tag label="Best value" tone="play" />
              </View>
            ) : null}
            <Button label={offer?.annual ? `${offer.annual.product.priceString} a year` : '€49 a year'} busy={busy === 'annual'} disabled={!offer?.annual} onPress={() => purchase('annual')} />
            {yearlyValue ? (
              <Txt variant="small" tone="quiet">
                {yearlyValue}
              </Txt>
            ) : null}
          </View>
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

        <Button
          kind="quiet"
          label="Prefer to use your own API keys?"
          onPress={() => {
            router.back()
            router.push('/keys')
          }}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
        />
        <Txt variant="small" tone="faint">
          Renews automatically until you cancel, at least 24 hours before the end of the period, in your iPhone’s Settings. Payment is taken by Apple.
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
          <Button
            kind="quiet"
            label="Restore purchases"
            busy={busy === 'restore'}
            onPress={async () => {
              setBusy('restore')
              setMessage(undefined)
              try {
                if ((await restore()) === 'plus') {
                  visit.current?.becamePlus()
                  confirmPlus()
                  router.back()
                } else setMessage(RESTORE_MESSAGES.none)
              } catch (e) {
                setMessage(restoreErrorMessage(e))
              } finally {
                setBusy(undefined)
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
