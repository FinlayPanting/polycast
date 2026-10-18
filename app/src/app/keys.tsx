import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, Linking, ScrollView, TextInput, View } from 'react-native'
import { Button, Notice, Screen, Txt } from '../components/ui'
import { api } from '../lib/api'
import { removeOwnKeys, saveOwnKey, savedKeyNames } from '../lib/ownKeys'
import { aboutDollars, keyGuides, type KeyGuide } from '../lib/ownKeysGuide'
import { space, type, usePalette } from '../theme'

/**
 * "Use your own API keys" (PC-1017-K2): a calm screen for the free route. What each key is for,
 * roughly what an hour costs, a step-by-step guide for each, and a paste field with a test tick.
 * Plus stays the easy path; this is reached from a quiet link on the Plus screen and from You.
 */
export default function Keys() {
  const p = usePalette()
  const [saved, setSaved] = useState({ elevenlabs: false, gemini: false })
  const guides = keyGuides()
  useEffect(() => {
    void savedKeyNames().then(setSaved)
  }, [])

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Button kind="quiet" label="Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        <Txt variant="title" accessibilityRole="header">
          Use your own API keys
        </Txt>
        <Txt tone="quiet">
          If you already have accounts with ElevenLabs and Google, Polycast can prepare your episodes on them instead of Plus. You pay those providers directly for what you use; Polycast charges nothing. Every episode you prepare is free for everyone learning that language.
        </Txt>
        <Txt variant="small" tone="quiet">
          Your keys stay in your iPhone’s Keychain. They’re sent to Polycast only while an episode is being prepared, and deleted from our server as soon as it’s done.
        </Txt>

        {guides.map((g) => (
          <KeyCard key={g.provider} guide={g} saved={saved[g.provider]} onSaved={() => setSaved((s) => ({ ...s, [g.provider]: true }))} />
        ))}

        {saved.elevenlabs && saved.gemini ? (
          <View style={{ backgroundColor: p.raised, borderRadius: 18, padding: space.lg, gap: space.xs }}>
            <Txt variant="bodyStrong">You’re set</Txt>
            <Txt variant="small" tone="quiet">
              New episodes you prepare now use your own keys, with no allowance.
            </Txt>
          </View>
        ) : null}

        {saved.elevenlabs || saved.gemini ? (
          <Button
            kind="quiet"
            label="Remove my keys"
            onPress={() =>
              Alert.alert('Remove your keys?', 'They’re deleted from this iPhone and from any episode still waiting to be prepared. You can add them again any time.', [
                { text: 'Keep them', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: async () => {
                    await removeOwnKeys()
                    setSaved({ elevenlabs: false, gemini: false })
                  },
                },
              ])
            }
            style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
          />
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function KeyCard({ guide, saved, onSaved }: { guide: KeyGuide; saved: boolean; onSaved: () => void }) {
  const p = usePalette()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string }>()

  async function testAndSave() {
    setBusy(true)
    setResult(undefined)
    try {
      const r = await api.testKey(guide.provider, value.trim())
      if (r.ok) {
        await saveOwnKey(guide.provider, value)
        setValue('')
        setResult({ ok: true, text: 'This key works. Saved on this iPhone.' })
        onSaved()
      } else setResult({ ok: false, text: r.message })
    } catch {
      setResult({ ok: false, text: 'We couldn’t check the key just now. Check your connection and try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ backgroundColor: p.raised, borderRadius: 20, padding: space.lg, gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <Txt variant="heading">{guide.name}</Txt>
        <Txt variant="small" tone="quiet">
          {guide.usedFor}
        </Txt>
        <Txt variant="small" tone="quiet">
          Roughly {aboutDollars(guide.hourUSD)} an hour of episode, at {guide.name}’s list prices.
        </Txt>
      </View>

      {guide.heads ? <Notice text={guide.heads} /> : null}

      <Button kind="quiet" label={open ? 'Hide the steps' : 'How to get this key'} onPress={() => setOpen((o) => !o)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      {open ? (
        <View style={{ gap: space.sm }}>
          {guide.steps.map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', gap: space.sm }}>
              <Txt variant="smallStrong" tone="quiet" style={{ width: 18 }}>
                {i + 1}.
              </Txt>
              <Txt variant="small" style={{ flex: 1 }}>
                {s}
              </Txt>
            </View>
          ))}
          <Button kind="secondary" label={guide.link.label} onPress={() => Linking.openURL(guide.link.url)} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}

      {saved ? (
        <Txt variant="smallStrong" accessibilityLiveRegion="polite">
          ✓ Key saved. Paste a new one below to replace it.
        </Txt>
      ) : null}
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={`Paste your ${guide.name} key`}
        placeholderTextColor={p.faint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        textContentType="none"
        accessibilityLabel={`${guide.name} API key`}
        style={[type.body, { letterSpacing: 0, minHeight: 48, borderRadius: 14, backgroundColor: p.bg, color: p.text, paddingHorizontal: space.md, borderWidth: 1, borderColor: p.line }]}
      />
      <Button label="Test and save" busy={busy} disabled={value.trim().length < 20} onPress={testAndSave} />
      {result ? (
        <Txt variant="small" tone={result.ok ? 'text' : 'quiet'} accessibilityLiveRegion="polite">
          {result.ok ? `✓ ${result.text}` : result.text}
        </Txt>
      ) : null}
    </View>
  )
}
