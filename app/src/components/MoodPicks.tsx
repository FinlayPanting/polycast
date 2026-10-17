import { MOOD_CHIPS, MOOD_MAX_CHARS } from '@polycast/core'
import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native'
import { api, type MoodPick } from '../lib/api'
import { moodPickByline, moodPickRoute } from '../lib/mood'
import { MIN_TAP, space, type, usePalette } from '../theme'
import { Mark } from './Mark'
import { Artwork, Txt } from './ui'

/**
 * "Tell Mia what you're in the mood for" (PC-1016-07): type a mood or tap a chip, and Mia picks
 * three shows or prepared episodes in the language with a line on why each fits.
 */
export function MoodPicks({ language, guideName, flagId }: { language: string; guideName: string; flagId?: string }) {
  const p = usePalette()
  const [mood, setMood] = useState('')
  const [asked, setAsked] = useState<string>()
  const [picks, setPicks] = useState<MoodPick[]>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const ask = async (m: string) => {
    const text = m.trim()
    if (!text || busy) return
    setMood(text)
    setAsked(text)
    setBusy(true)
    setError(undefined)
    setPicks(undefined)
    try {
      const r = await api.mood(language, text)
      setPicks(r.picks)
      if (r.picks.length === 0) setError(`${guideName} couldn't find a match just now. Try putting it another way.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ paddingHorizontal: space.lg }}>
        <TextInput
          value={mood}
          onChangeText={setMood}
          onSubmitEditing={() => void ask(mood)}
          maxLength={MOOD_MAX_CHARS}
          placeholder={`Tell ${guideName} what you're in the mood for`}
          placeholderTextColor={p.faint}
          returnKeyType="go"
          accessibilityLabel={`Tell ${guideName} what you're in the mood for`}
          style={[type.body, { letterSpacing: 0, minHeight: MIN_TAP + 4, borderRadius: 14, backgroundColor: p.raised, color: p.text, paddingHorizontal: space.md }]}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
        {MOOD_CHIPS.map((chip) => (
          <Pressable
            key={chip}
            accessibilityRole="button"
            accessibilityLabel={`Ask ${guideName} for ${chip.toLowerCase()}`}
            onPress={() => void ask(chip)}
            style={({ pressed }) => ({ minHeight: MIN_TAP - 8, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: 999, borderWidth: 1, borderColor: p.line, opacity: pressed ? 0.6 : 1 })}
          >
            <Txt variant="small">{chip}</Txt>
          </Pressable>
        ))}
      </ScrollView>

      {busy ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg }}>
          <Mark height={18} flagId={flagId} speaking accessibilityLabel="" />
          <Txt variant="small" tone="quiet">
            {guideName} is having a look…
          </Txt>
          <ActivityIndicator color={p.quiet} />
        </View>
      ) : null}
      {error ? (
        <Txt variant="small" tone="quiet" style={{ paddingHorizontal: space.lg }}>
          {error}
        </Txt>
      ) : null}
      {picks && picks.length > 0 ? (
        <View style={{ gap: space.xs, paddingHorizontal: space.lg }}>
          <Txt variant="smallStrong" tone="quiet">
            {guideName}'s picks for “{asked}”
          </Txt>
          {picks.map((pick, i) => (
            <Pressable
              key={`${pick.kind}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`${pick.title}. ${moodPickByline(pick)}. ${pick.why}`}
              onPress={() => router.push(moodPickRoute(pick) as any)}
              style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, alignItems: 'center', paddingVertical: space.sm, opacity: pressed ? 0.6 : 1 })}
            >
              <Artwork uri={pick.artwork} size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="smallStrong" numberOfLines={1}>
                  {pick.title}
                </Txt>
                {moodPickByline(pick) ? (
                  <Txt variant="small" tone="quiet" numberOfLines={1}>
                    {moodPickByline(pick)}
                  </Txt>
                ) : null}
                <Txt variant="small">{pick.why}</Txt>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}
