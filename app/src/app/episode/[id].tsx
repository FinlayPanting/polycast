import { FREE_EPISODE_MAX_SEC, PLUS_MONTHLY_SEC } from '@polycast/core'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, View } from 'react-native'
import { Artwork, Button, Notice, Screen, Tag, Txt, minutes } from '../../components/ui'
import { api, refusalOf } from '../../lib/api'
import { GUIDANCE, guideName, guidanceLevelOr, languageName, voicedGuideId, type GuidanceLevelId } from '../../lib/languages'
import { canSyncOnDevice, prefetchEpisode, type GetReadyStep } from '../../lib/episodeAudio'
import { downloadForOffline, isSavedForOffline, loadLesson, removeSaved } from '../../lib/offline'
import { earlyPrimerUrl, jumpStart, loadEarlyPrimer, primerSource } from '../../lib/primer'
import { config } from '../../lib/config'
import { Primer, PrimerBuilding } from '../../components/Primer'
import { TranslatedDescription, TranslatedLine } from '../../components/Translated'
import { useTranslations } from '../../lib/translate'
import type { Primer as PrimerData } from '@polycast/core'
import { enableReadyNotifications } from '../../lib/notifications'
import { useSession } from '../../lib/session'
import { getEpisode } from '../../lib/data'
import { useAsync } from '../../lib/useAsync'
import { MIN_TAP, space, usePalette } from '../../theme'
import { Loading } from '../../components/Loading'
import { loadOwnKeys, type OwnKeys } from '../../lib/ownKeys'
import { OWN_KEYS_COST_LINE, SLOW_KEY_LINE } from '../../lib/ownKeysCore'

const STAGES: Record<string, string> = {
  transcribing: 'Listening to the episode',
  translating: 'Writing the subtitles',
  writing: 'Planning what your guide will say',
  voicing: 'Recording your guide',
  'slow-key': SLOW_KEY_LINE,
  done: 'Ready',
}

export default function Episode() {
  const p = usePalette()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session, profile, refreshProfile, updatePrefs } = useSession()
  const [jobId, setJobId] = useState<string>()
  const [stage, setStage] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; upgrade?: boolean }>()
  const [downloaded, setDownloaded] = useState<number>()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState<GetReadyStep>()
  const [saveError, setSaveError] = useState<string>()
  const [preparedByMe, setPreparedByMe] = useState(false)
  const [offline, setOffline] = useState(false)
  // The learner's own API keys, when they've added both (PC-1017-K1): preparation then runs on them.
  const [ownKeys, setOwnKeys] = useState<OwnKeys>()
  useEffect(() => {
    void loadOwnKeys().then(setOwnKeys)
  }, [])
  const [serverPrimer, setServerPrimer] = useState<PrimerData | null>()
  const [serverGuide, setServerGuide] = useState<string>()
  const [earlyPrimer, setEarlyPrimer] = useState<PrimerData>()

  const { data: ep, reload } = useAsync(async () => {
    const { episode, activeJob, preparedByMe: mine, offline: isOffline } = await getEpisode(id)
    setPreparedByMe(Boolean(mine))
    setOffline(Boolean(isOffline))
    setSaved(isSavedForOffline(episode.id))
    if (activeJob) {
      setJobId(activeJob.id)
      setStage(activeJob.stage ?? undefined)
    }
    return episode
  }, [id])
  // The title and description in the learner's language, made once and shared (PC-1017-T1).
  const tr = useTranslations({ titles: ep ? [ep.title] : [], episodeId: ep?.description ? ep.id : undefined }, Boolean(ep) && !offline)

  // The primer, once the episode is ready (PC-1017-P4). Offline, the saved lesson's copy is used.
  useEffect(() => {
    if (ep?.status !== 'ready' || offline) return
    let live = true
    api.primer(ep.id).then(
      (r) => {
        if (!live) return
        setServerPrimer(r.primer)
        setServerGuide(r.guideId ?? undefined)
      },
      () => live && setServerPrimer(null),
    )
    return () => {
      live = false
    }
  }, [ep?.id, ep?.status, offline])

  // While preparing, the primer appears once the lesson plan is written (PC-1017-P3): from the
  // 'voicing' stage on, look for it on each check until it's there.
  useEffect(() => {
    if (!ep || earlyPrimer || config.demo || !(stage === 'voicing' || stage === 'done')) return
    let live = true
    void loadEarlyPrimer(earlyPrimerUrl(config.supabaseUrl, ep.id)).then((p) => live && p && setEarlyPrimer(p))
    return () => {
      live = false
    }
  }, [ep, stage, earlyPrimer])

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
          if (job.status === 'done') setPreparedByMe(true)
          if (job.status === 'failed') setMessage({ text: job.message ?? 'We couldn’t prepare this episode. Nothing was taken from your allowance. Please try again later.' })
          await Promise.all([reload(), refreshProfile()])
        }
      } catch {
        // Keep trying quietly; the notification will arrive anyway.
      }
    }, 4000)
    return () => clearInterval(t)
  }, [jobId, reload, refreshProfile])

  // While the lesson is being prepared, download the learner's copy alongside it, so the episode
  // is ready to play as soon as the lesson is.
  const preparingNow = Boolean(jobId) || ep?.status === 'preparing'
  useEffect(() => {
    if (!ep || !preparingNow || !ep.audio_url) return
    return prefetchEpisode(ep.id, ep.audio_url, setDownloaded)
  }, [ep, preparingNow])

  // An episode this learner prepared saves itself to the phone (audio, lesson and the guide's
  // voice) as soon as it's ready, so it plays offline from then on.
  useEffect(() => {
    if (ep?.status === 'ready' && preparedByMe && !saved && !saving && !saveError && !offline && canSyncOnDevice) void save()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ep?.status, preparedByMe, saved, offline])

  async function save() {
    if (!ep) return
    setSaveError(undefined)
    setSaving({ step: 'downloading', progress: 0 })
    try {
      await downloadForOffline(ep.id, setSaving)
      setSaved(true)
    } catch {
      setSaveError('We couldn’t save this episode to your phone. Check your connection and try again.')
    } finally {
      setSaving(undefined)
    }
  }

  function remove() {
    if (!ep) return
    Alert.alert('Remove the download?', 'It frees up space on your phone. You can download it again any time while you’re online.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeSaved(ep.id, ep.audio_url)
          setSaved(false)
        },
      },
    ])
  }

  if (!ep) return <Screen><Loading /></Screen>

  const level = guidanceLevelOr(profile?.guidance_level, 'standard')
  const listenNow = () => router.push({ pathname: '/listen/[id]', params: { id: ep.id, guide: '1', level } })
  // From the episode map: start listening a few seconds before that place (PC-1017-P5).
  const listenFrom = (at: number) => router.push({ pathname: '/listen/[id]', params: { id: ep.id, guide: '1', level, from: String(jumpStart(at)) } })
  const savedLesson = saved ? loadLesson(ep.id)?.payload : undefined
  // Named after the voice the learner will hear: the saved lesson's, else the one the server will play (PC-1017-F01).
  const readyGuide = guideName(voicedGuideId(savedLesson?.guideId ?? serverGuide, profile?.guide_id))
  const primer = ep.status === 'ready' ? primerSource(savedLesson && { primer: savedLesson.plan?.primer, audioUrl: savedLesson.episode.audioUrl }, serverPrimer, ep.audio_url, canSyncOnDevice) : undefined
  // The last choice becomes the default for the next episode (PC-1017-F13).
  const chooseLevel = (l: GuidanceLevelId) => void updatePrefs({ guidance_level: l }).catch(() => undefined)

  const preparing = Boolean(jobId) || ep.status === 'preparing'
  const plus = profile?.plan === 'plus'
  const cost = ownKeys
    ? OWN_KEYS_COST_LINE
    : plus
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
      const r = await api.prepare(ep!.id, ownKeys)
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
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Button kind="quiet" label="Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        <Artwork uri={ep.image ?? ep.podcasts.artwork} size={primer ? 120 : 240} radius={primer ? 14 : 20} />
        <View style={{ gap: space.sm }}>
          <View>
            <Txt variant="title" accessibilityRole="header">
              {ep.title}
            </Txt>
            <TranslatedLine text={tr.titles.get(ep.title)} pending={tr.pending} variant="body" />
          </View>
          <Txt tone="quiet">
            {ep.podcasts.title}, {minutes(ep.duration_sec)}
          </Txt>
          {ep.description && !primer ? <TranslatedDescription original={ep.description} translation={tr.episodeDescription} pending={tr.pending} /> : null}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {ep.status === 'ready' ? <Tag label="Ready" tone="play" /> : null}
            {ep.difficulty ? <Tag label={ep.difficulty.label} tone="level" /> : null}
          </View>
        </View>

        {primer ? (
          <Primer primer={primer.primer} audioUrl={primer.audioUrl} languageName={languageName(profile?.target_language)} onSkip={listenNow} durationSec={ep.duration_sec} onJump={listenFrom} />
        ) : null}

        {ep.status === 'ready' ? (
          <View style={{ gap: space.sm }}>
            <LevelPicker guide={readyGuide} value={level} onChange={chooseLevel} />
            <Button label={`Listen with ${readyGuide}`} onPress={listenNow} />
            <Button kind="secondary" label="Subtitles only" onPress={() => router.push({ pathname: '/listen/[id]', params: { id: ep.id, guide: '0' } })} />
            {canSyncOnDevice ? (
              <View style={{ gap: space.xs, paddingTop: space.sm }} accessibilityLiveRegion="polite">
                {saving ? (
                  <Txt variant="small" tone="quiet">
                    {saving.step === 'downloading'
                      ? `Saving to your phone: the episode, ${Math.round(saving.progress * 100)}%`
                      : saving.step === 'guide'
                        ? `Saving to your phone: ${readyGuide}’s voice, ${Math.round(saving.progress * 100)}%`
                        : 'Saving to your phone: lining up your lesson'}
                  </Txt>
                ) : saved ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
                    <Txt variant="small" tone="quiet" style={{ flex: 1 }}>
                      Saved on this phone. Plays offline.
                    </Txt>
                    <Button kind="quiet" label="Remove download" onPress={remove} style={{ paddingHorizontal: 0 }} />
                  </View>
                ) : offline ? null : (
                  <Button kind="quiet" label="Download for offline" onPress={() => void save()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
                )}
                {saveError ? <Txt variant="small" tone="quiet">{saveError}</Txt> : null}
              </View>
            ) : null}
          </View>
        ) : preparing ? (
          <View style={{ gap: space.md }}>
            <View style={{ gap: space.sm, backgroundColor: p.raised, borderRadius: 18, padding: space.lg }} accessibilityLiveRegion="polite">
              <Txt variant="bodyStrong">{STAGES[stage ?? ''] ?? 'Getting started'}…</Txt>
              <Txt variant="small" tone="quiet">
                This takes a few minutes. We’ll send you a notification when it’s ready, so you can leave this screen.
              </Txt>
              {downloaded !== undefined ? (
                <Txt variant="small" tone="quiet">
                  {downloaded >= 1 ? 'Episode saved to your phone.' : `Saving the episode to your phone: ${Math.round(downloaded * 100)}%`}
                </Txt>
              ) : null}
            </View>
            {earlyPrimer ? <PrimerBuilding primer={earlyPrimer} guide={guideName(profile?.guide_id)} /> : null}
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <Txt tone="quiet">{cost}</Txt>
            {ownKeys || plus || (!profile?.free_episode_used && ep.duration_sec <= FREE_EPISODE_MAX_SEC) ? (
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

/** How often the guide steps in on this episode: Hands-on, Standard or Light, each with what it feels like. */
function LevelPicker({ guide, value, onChange }: { guide: string; value: GuidanceLevelId; onChange: (l: GuidanceLevelId) => void }) {
  const p = usePalette()
  return (
    <View style={{ gap: space.sm, paddingBottom: space.sm }}>
      <Txt variant="smallStrong">How often should {guide} step in?</Txt>
      <View style={{ gap: space.xs }} accessibilityRole="radiogroup">
        {GUIDANCE.map((g) => {
          const selected = g.id === value
          return (
            <Pressable
              key={g.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${g.title}. ${g.line}`}
              onPress={() => onChange(g.id)}
              style={{ minHeight: MIN_TAP, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 16, backgroundColor: p.raised, borderWidth: selected ? 2 : 1, borderColor: selected ? p.level : p.line, gap: 2 }}
            >
              <Txt variant="smallStrong">{g.title}</Txt>
              <Txt variant="small" tone="quiet">
                {g.line}
              </Txt>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
