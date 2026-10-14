import { alternateIconName, flagsForLanguage, PLUS_MONTHLY_SEC } from '@polycast/core'
import { setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons'
import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native'
import { InterestPicker } from '../../components/InterestPicker'
import { Mark } from '../../components/Mark'
import { Button, Screen, Txt, minutes } from '../../components/ui'
import { api } from '../../lib/api'
import { GUIDANCE, GUIDES, LANGUAGES, languageName } from '../../lib/languages'
import { useSession, type ProfilePrefs } from '../../lib/session'
import { MIN_TAP, space, usePalette } from '../../theme'
import { Loading } from '../../components/Loading'

function Choice<T extends string>({ options, value, onChange, accent }: { options: { id: T; label: string }[]; value: T | undefined; onChange: (v: T) => void; accent: string }) {
  const p = usePalette()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.id === value
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.id)}
            style={{ minHeight: MIN_TAP, paddingHorizontal: space.md, borderRadius: 22, justifyContent: 'center', backgroundColor: p.raised, borderWidth: selected ? 2 : 1, borderColor: selected ? accent : p.line }}
          >
            <Txt variant="smallStrong">{o.label}</Txt>
          </Pressable>
        )
      })}
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.md }}>
      <Txt variant="heading" accessibilityRole="header">
        {title}
      </Txt>
      {children}
    </View>
  )
}

export default function You() {
  const p = usePalette()
  const { profile, updatePrefs, signOut } = useSession()
  const [error, setError] = useState<string>()
  if (!profile) return <Screen><Loading /></Screen>

  const set = (prefs: ProfilePrefs) => updatePrefs(prefs).catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t save that.'))
  const language = profile.target_language ?? 'sv'
  const flagOptions = [{ id: 'polycast', label: 'Polycast colours' }, ...flagsForLanguage(language).map((f) => ({ id: f.id, label: f.label }))]

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }}>
        <Txt variant="title" accessibilityRole="header">
          You
        </Txt>

        <View style={{ backgroundColor: p.raised, borderRadius: 20, padding: space.lg, gap: space.sm }}>
          <Txt variant="bodyStrong">{profile.plan === 'plus' ? 'Plus' : 'Free'}</Txt>
          <Txt variant="small" tone="quiet">
            {profile.plan === 'plus'
              ? `${minutes(Math.max(0, PLUS_MONTHLY_SEC - profile.plus_used_sec))} of new episodes left this month.`
              : profile.free_episode_used
                ? 'You’ve used your free episode. Every ready episode is still free, with the guide on one a week.'
                : 'Your free episode is waiting: pick any show and prepare one episode, up to 2 hours.'}
          </Txt>
          {profile.plan !== 'plus' ? <Button label="See Plus" onPress={() => router.push('/plus')} style={{ marginTop: space.sm }} /> : null}
        </View>

        <Section title="Learning">
          <Choice options={LANGUAGES.map((l) => ({ id: l.code, label: l.name }))} value={language} accent={p.play} onChange={(code) => set({ target_language: code, flag_id: LANGUAGES.find((l) => l.code === code)?.defaultFlag ?? 'polycast' })} />
        </Section>

        <Section title="Your interests">
          <Txt variant="small" tone="quiet">
            Discover leads with {languageName(language)} shows about these.
          </Txt>
          <InterestPicker value={profile.interests ?? []} onChange={(interests) => set({ interests })} />
        </Section>

        <Section title="Guidance">
          <Choice options={GUIDANCE.map((g) => ({ id: g.id, label: g.title }))} value={profile.guidance_level} accent={p.level} onChange={(id) => set({ guidance_level: id })} />
          <Txt variant="small" tone="quiet">
            {GUIDANCE.find((g) => g.id === profile.guidance_level)?.line}
          </Txt>
        </Section>

        <Section title="Your guide">
          <Choice options={GUIDES.map((g) => ({ id: g.id, label: g.name }))} value={profile.guide_id} accent={p.guide} onChange={(id) => set({ guide_id: id })} />
        </Section>

        <Section title="Subtitles">
          <Choice
            options={[
              { id: 'both', label: 'Both languages' },
              { id: 'target', label: `${languageName(language)} only` },
              { id: 'none', label: 'Off' },
            ]}
            value={profile.subtitle_mode}
            accent={p.play}
            onChange={(id) => set({ subtitle_mode: id })}
          />
        </Section>

        <Section title="Your mark">
          <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
            <Mark height={56} flagId={profile.flag_id} />
            <Txt variant="small" tone="quiet" style={{ flex: 1 }}>
              Show the bars in the colours of a flag. {supportsAlternateIcons ? 'Your home-screen icon changes too.' : ''}
            </Txt>
          </View>
          <Choice
            options={flagOptions}
            value={profile.flag_id}
            accent={p.play}
            onChange={async (id) => {
              await set({ flag_id: id })
              if (supportsAlternateIcons) await setAlternateAppIcon(alternateIconName(id)).catch(() => {})
            }}
          />
        </Section>

        {error ? (
          <Txt variant="small" tone="saved">
            {error}
          </Txt>
        ) : null}

        <Section title="Account">
          <Button kind="secondary" label="Privacy policy" onPress={() => Linking.openURL('https://polycast.app/privacy')} />
          <Button kind="secondary" label="For podcast creators" onPress={() => Linking.openURL('https://polycast.app/creators')} />
          <Button kind="secondary" label="Sign out" onPress={signOut} />
          <Button
            kind="quiet"
            label="Delete my account"
            onPress={() =>
              Alert.alert('Delete your account?', 'This removes your profile, saved words and listening history for good. If you have Plus, cancel it in your iPhone’s Settings too.', [
                { text: 'Keep my account', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await api.deleteAccount()
                      await signOut()
                    } catch {
                      setError('Your account couldn’t be deleted just now. Please try again.')
                    }
                  },
                },
              ])
            }
          />
        </Section>
      </ScrollView>
    </Screen>
  )
}
