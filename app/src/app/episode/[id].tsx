import { FREE_EPISODE_MAX_SEC, PLUS_MONTHLY_SEC } from '@polycast/core'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Artwork, Button, Notice, Screen, Tag, Txt, minutes } from '../../components/ui'
import { api, refusalOf } from '../../lib/api'
import { guideName } from '../../lib/languages'
import { enableReadyNotifications } from '../../lib/notifications'
import { useSession } from '../../lib/session'
import { getEpisode } from '../../lib/data'
import { useAsync } from '../../lib/useAsync'
import { space, usePalette } from '../../theme'

const STAGES: Record<string, string> = {
  transcribing: 'Listening to the episode',
  translating: 'Writing the subtitles',
  writing: 'Planning what your guide will say',
  voicing: 'Recording your guide',
  done: 'Ready',
}

export default function Episode() {
  const p = usePalette()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session, profile, refreshProfile } = useSession()
  const [jobId, setJobId] = useState<string>()
  const [stage, setStage] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; upgrade?: boolean }>()

  const { data: ep, reload } = useAsync(async () => {
    const { episode, activeJob } = await getEpisode(id)
    if (activeJob) {
      setJobId(activeJob.id)
      setStage(activeJob.stage ?? undefined)
    }
    return episode
  }, [id])

  // Follow a preparation until it's done.
  useEffect(() => {
    if (!jobId) return
    const t = setInterval(async () => {
      try {
        const job = await api.job(jobId)
        setStage(job.stage ?? undefined)
        if (job.status === 'done' || job.status === 'failed') {
          clearInterval(t)
          setJobId(undefined)
          if (job.status === 'failed') setMessage({ text: 'We couldn’t prepare this episode. Nothing was taken from your allowance. Please try again later.' })
          await Promise.all([reload(), refreshProfile()])
        }
      } catch {
        // Keep trying quietly; the notification will arrive anyway.
      }
    }, 4000)
    return () => clearInterval(t)
  }, [jobId, reload, refreshProfile])

  if (!ep) return <Screen />

  const preparing = Boolean(jobId) || ep.status === 'preparing'
  const plus = profile?.plan === 'plus'
  const cost = plus
    ? `Uses ${minutes(ep.duration_sec)} of your 5 hours of new episodes this month (${minutes(Math.max(0, PLUS_MONTHLY_SEC - (profile?.plus_used_sec ?? 0)))} left).`
    : profile?.free_episode_used
      ? 'Preparing new episodes is part of Plus. Episodes marked Ready are free to everyone.'
      : ep.duration_sec > FREE_EPISODE_MAX_SEC
        ? 'Your free episode can be up to 2 hours. This one is longer, so it needs Plus.'
        : 'This uses your free episode. Once it’s ready, it’s free for everyone learning this language.'

  async function prepare() {
    if (!session) return
    setBusy(true)
    setMessage(undefined)
    try {
      const r = await api.prepare(ep!.id)
      if (r.status === 'ready') return reload()
      setJobId(r.jobId)
      setStage(undefined)
      void enableReadyNotifications(session.user.id)
      void refreshProfile()
    } catch (e) {
      const refusal = refusalOf(e)
      setMessage({ text: refusal?.message ?? (e instanceof Error ? e.message : 'Something went wrong.'), upgrade: refusal ? refusal.reason !== 'service-paused' : false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Button kind="quiet" label="Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        <Artwork uri={ep.image ?? ep.podcasts.artwork} size={240} radius={20} />
        <View style={{ gap: space.sm }}>
          <Txt variant="title" accessibilityRole="header">
            {ep.title}
          </Txt>
          <Txt tone="quiet">
            {ep.podcasts.title}, {minutes(ep.duration_sec)}
          </Txt>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {ep.status === 'ready' ? <Tag label="Ready" tone="play" /> : null}
            {ep.difficulty ? <Tag label={ep.difficulty.label} tone="level" /> : null}
          </View>
        </View>

        {ep.status === 'ready' ? (
          <View style={{ gap: space.sm }}>
            <Button label={`Listen with ${guideName(profile?.guide_id)}`} onPress={() => router.push({ pathname: '/listen/[id]', params: { id: ep.id, guide: '1' } })} />
            <Button kind="secondary" label="Subtitles only" onPress={() => router.push({ pathname: '/listen/[id]', params: { id: ep.id, guide: '0' } })} />
          </View>
        ) : preparing ? (
          <View style={{ gap: space.sm, backgroundColor: p.raised, borderRadius: 18, padding: space.lg }} accessibilityLiveRegion="polite">
            <Txt variant="bodyStrong">{STAGES[stage ?? ''] ?? 'Getting started'}…</Txt>
            <Txt variant="small" tone="quiet">
              This takes a few minutes. We’ll send you a notification when it’s ready, so you can leave this screen.
            </Txt>
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <Txt tone="quiet">{cost}</Txt>
            {plus || (!profile?.free_episode_used && ep.duration_sec <= FREE_EPISODE_MAX_SEC) ? (
              <Button label="Prepare this episode" busy={busy} onPress={prepare} />
            ) : (
              <Button label="See Plus" onPress={() => router.push('/plus')} />
            )}
          </View>
        )}

        {message ? <Notice text={message.text} action={message.upgrade && !plus ? { label: 'See Plus', onPress: () => router.push('/plus') } : undefined} /> : null}
      </ScrollView>
    </Screen>
  )
}
