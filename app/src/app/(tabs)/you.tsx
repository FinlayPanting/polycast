import { alternateIconName, flagsForLanguage, PLUS_MONTHLY_SEC, seasonalLine } from '@polycast/core'
import { setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, Share, View } from 'react-native'
import { InterestPicker } from '../../components/InterestPicker'
import { Mark } from '../../components/Mark'
import { Button, Screen, Tag, Txt, minutes } from '../../components/ui'
import { savedKeyNames } from '../../lib/ownKeys'
import { api } from '../../lib/api'
import { clearAllDownloads, downloadsSize } from '../../lib/episodeAudio'
import { formatSize } from '../../lib/storage'
import { GUIDANCE, GUIDES, LANGUAGES, languageName } from '../../lib/languages'
import { useSession, type ProfilePrefs } from '../../lib/session'
import { MIN_TAP, space, usePalette } from '../../theme'
import { Loading } from '../../components/Loading'
import { SwitchRow } from '../../components/SwitchRow'
import { setAllowsMobileData, useAllowsMobileData } from '../../lib/autoDownload'
import Constants from 'expo-constants'
import { playbackLog } from '../../lib/playbackLog'
import { useWhatsNewDot } from '../../lib/whatsNew'
import { useKept } from '../../lib/keptList'
import { seasonStamps } from '../../lib/stamps'
import { stampDate } from '../../lib/stampsCore'

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
  const autoMobileData = useAllowsMobileData()
  const { profile, updatePrefs, signOut } = useSession()
  // What's new (PC-1019-F02): an orange dot until the latest build's changes have been seen.
  const whatsNew = useWhatsNewDot()
  // Whether this iPhone has both own keys (PC-1017-K2); checked again whenever You comes into view.
  const [ownKeys, setOwnKeys] = useState(false)
  useFocusEffect(
    useCallback(() => {
      whatsNew.refresh()
      void savedKeyNames().then((k) => setOwnKeys(k.elevenlabs && k.gemini))
    }, []),
  )
  const [usedBytes, setUsedBytes] = useState(() => downloadsSize())
  const [error, setError] = useState<string>()
  // Seasonal stamps (PC-1024-07), kept on this phone; the section only appears once there is one.
  const stamps = useKept(seasonStamps)
  if (!profile) return <Screen><Loading /></Screen>

  const set = (prefs: ProfilePrefs) => updatePrefs(prefs).catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t save that.'))
  const language = profile.target_language ?? 'sv'
  // New Year learners (PC-1023-04): 26 Dec to 18 Jan only, then gone by itself. Copy and timing, no price change.
  const newYear = seasonalLine('plusCard', new Date(), languageName(language))
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
          {ownKeys ? <Tag label="Using your own keys" tone="saved" /> : null}
          {profile.plan !== 'plus' && newYear ? <Txt variant="small">{newYear}</Txt> : null}
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

        {stamps.length ? (
          <Section title="Stamps">
            <Txt variant="small" tone="quiet">
              A keepsake for each holiday you listened through with your guide. Kept on this phone.
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {stamps.map((s) => (
                <View
                  key={s.seasonId}
                  accessible
                  accessibilityLabel={`${s.name}, ${stampDate(s)}`}
                  style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 14, borderWidth: 1.5, borderColor: p.play, borderStyle: 'dashed', gap: 2 }}
                >
                  <Txt variant="smallStrong">{s.name}</Txt>
                  <Txt variant="small" tone="quiet">
                    {stampDate(s)}
                  </Txt>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {error ? (
          <Txt variant="small" tone="saved">
            {error}
          </Txt>
        ) : null}

        <Section title="Downloads">
          <Txt tone="quiet">{usedBytes > 0 ? `Polycast is using ${formatSize(usedBytes)} on this phone for downloaded episodes.` : 'No episodes are downloaded on this phone.'}</Txt>
          <Txt variant="small" tone="faint">
            Downloads stay out of your iCloud backup, and ones you haven’t played for 30 days are tidied away, unless a saved word comes from them.
          </Txt>
          <SwitchRow
            label="Auto-download on mobile data"
            hint="For shows you’ve set to download new episodes. Off means Wi-Fi only."
            value={autoMobileData}
            onChange={setAllowsMobileData}
          />
          {usedBytes > 0 ? (
            <Button
              kind="secondary"
              label="Clear downloads"
              onPress={() =>
                Alert.alert('Clear downloads?', 'Episodes will download again when you play them. Saved words keep their meanings, but their clips won’t play until their episodes are downloaded again.', [
                  { text: 'Keep them', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      clearAllDownloads()
                      setUsedBytes(downloadsSize())
                    },
                  },
                ])
              }
            />
          ) : null}
        </Section>

        <Section title="Your own API keys">
          <Txt variant="small" tone="quiet">
            {ownKeys ? 'Episodes you prepare run on your ElevenLabs and Google keys. Replace or remove them here.' : 'Prepare episodes on your own ElevenLabs and Google accounts instead of Plus.'}
          </Txt>
          <Button kind="secondary" label={ownKeys ? 'Manage your keys' : 'Use your own API keys'} onPress={() => router.push('/keys')} style={{ alignSelf: 'flex-start' }} />
        </Section>

        <Section title="Tell Finlay">
          <Txt variant="small" tone="quiet">
            Something confusing, broken or lovely? Send Finlay a quick note, with a screenshot of the screen you were just on if you like.
          </Txt>
          <Button kind="secondary" label="Tell Finlay" onPress={() => router.push('/feedback')} style={{ alignSelf: 'flex-start' }} />
        </Section>

        <Section title="Support Polycast">
          <Txt variant="small" tone="quiet">
            Enjoying it? A one-off tip helps keep Polycast free for everyone. It doesn’t unlock anything.
          </Txt>
          <Button kind="secondary" label="Leave a tip" onPress={() => router.push('/tip')} style={{ alignSelf: 'flex-start' }} />
        </Section>

        <Section title="Account">
          <Button kind="secondary" label="Privacy policy" onPress={() => Linking.openURL('https://polycast.app/privacy')} />
          <Button kind="secondary" label="For podcast creators" onPress={() => Linking.openURL('https://polycast.app/creators')} />
          {Constants.expoConfig?.extra?.testBuild ? (
            <Button kind="secondary" label="Share playback log" onPress={() => void Share.share({ message: playbackLog() || 'Nothing played yet.' })} />
          ) : null}
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`What’s new${whatsNew.dot ? ', new changes' : ''}. Version ${Constants.expoConfig?.version ?? ''}`}
          onPress={() => router.push('/whats-new')}
          style={({ pressed }) => ({ minHeight: MIN_TAP, flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: pressed ? 0.7 : 1 })}
        >
          <Txt variant="small">What’s new</Txt>
          {whatsNew.dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.play }} /> : null}
          <Txt variant="small" tone="faint" style={{ marginLeft: 'auto' }}>
            Version {Constants.expoConfig?.version ?? ''}
          </Txt>
        </Pressable>
      </ScrollView>
    </Screen>
  )
}
