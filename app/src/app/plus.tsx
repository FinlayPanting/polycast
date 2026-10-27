import { router } from 'expo-router'
import { useState } from 'react'
import { Linking, ScrollView, View, useWindowDimensions } from 'react-native'
import { Mark } from '../components/Mark'
import { Button, Screen, Tag, Txt } from '../components/ui'
import { buy, plusOffer, restore } from '../lib/purchases'
import { DEFAULT_ANNUAL, DEFAULT_MONTHLY, type PlanPrice, yearlyValueLine } from '../lib/planValue'
import { RESTORE_MESSAGES, restoreErrorMessage } from '../lib/plusPending'
import { useSession } from '../lib/session'
import { countFinishedGuided } from '../lib/data'
import { guideName, languageName } from '../lib/languages'
import { PLUS_KEEP_GOING, plusOpener } from '../lib/plusOpener'
import { countWords } from '../lib/words'
import { useAsync } from '../lib/useAsync'
import { PLUS_BUTTON_MAX, PLUS_TEXT_MAX, plusLayout } from '../lib/screenShape'
import { space, usePalette } from '../theme'

const WHAT_YOU_GET = [
  'Your guide on every episode, not one a week',
  'Up to 5 hours of brand-new episodes a month, from any show',
  'Your whole word bank, with spaced reviews',
]

/** Plus: €4.99 a month or €49 a year (spec: Plans; yearly raised from €39 on 19 Oct 2026), sold through the App Store. */
export default function Plus() {
  const p = usePalette()
  const win = useWindowDimensions()
  // Both iPhone Duo displays (PC-1026-02): a 600-point column, 400-point buttons, a compact footer when folded.
  const { compactFooter } = plusLayout(win.width, win.height, space.lg)
  const { confirmPlus, profile } = useSession()
  const language = profile?.target_language ?? undefined
  // What the learner already has, said first (PC-1023-03). If the counts can't be read, the screen is as before.
  const { data: mine } = useAsync(async () => {
    const [words, finished] = await Promise.all([language ? countWords(language).catch(() => undefined) : undefined, countFinishedGuided().catch(() => undefined)])
    return plusOpener({ words, finished, languageName: languageName(language), guideName: guideName(profile?.guide_id) })
  }, [language, profile?.guide_id])
  const { data: offer, error } = useAsync(plusOffer, [])
  const [busy, setBusy] = useState<string>()
  const [message, setMessage] = useState<string>()
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
        confirmPlus()
        router.back()
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The purchase didn’t go through.')
    } finally {
      setBusy(undefined)
    }
  }

  function openKeys() {
    router.back()
    router.push('/keys')
  }

  async function restorePurchases() {
    setBusy('restore')
    setMessage(undefined)
    try {
      if ((await restore()) === 'plus') {
        confirmPlus()
        router.back()
      } else setMessage(RESTORE_MESSAGES.none)
    } catch (e) {
      setMessage(restoreErrorMessage(e))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      {/* The way out stays put, outside the scroll, whatever the screen's shape (PC-1026-02). */}
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, alignItems: 'flex-end' }}>
        <Button kind="quiet" label="Not now" onPress={() => router.back()} style={{ paddingHorizontal: 0 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: PLUS_TEXT_MAX, gap: space.lg }}>
          <Mark height={64} speaking />
          <Txt variant="title">Polycast Plus</Txt>
          {mine ? (
            <View style={{ gap: space.xs }}>
              <Txt variant="bodyStrong">{mine}</Txt>
              <Txt tone="quiet">{PLUS_KEEP_GOING}</Txt>
            </View>
          ) : null}
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

          <View style={{ gap: space.sm, width: '100%', maxWidth: PLUS_BUTTON_MAX }}>
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

          {compactFooter ? null : (
            <Button kind="quiet" label="Prefer to use your own API keys?" onPress={openKeys} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
          )}
          <Txt variant="small" tone="faint">
            Renews automatically until you cancel, at least 24 hours before the end of the period, in your iPhone’s Settings. Payment is taken by Apple.
          </Txt>
          <View style={{ flexDirection: 'row', gap: compactFooter ? space.sm : space.md, flexWrap: 'wrap' }}>
            <Button kind="quiet" label="Restore purchases" busy={busy === 'restore'} onPress={restorePurchases} style={{ paddingHorizontal: 0 }} />
            <Button kind="quiet" label="Terms" onPress={() => Linking.openURL('https://polycast.app/terms')} style={{ paddingHorizontal: 0 }} />
            <Button kind="quiet" label="Privacy" onPress={() => Linking.openURL('https://polycast.app/privacy')} style={{ paddingHorizontal: 0 }} />
            {compactFooter ? <Button kind="quiet" label="Your own API keys" onPress={openKeys} style={{ paddingHorizontal: 0 }} /> : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}
