import { advertAt, findOldFriends, normalizeToken, segmentAt, selectMoments, wordClip, type Clip, type GuideMoment } from '@polycast/core'
import { router, useLocalSearchParams } from 'expo-router'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActionSheetIOS, Alert, AppState, Modal, Platform, Pressable, ScrollView, Share, View } from 'react-native'
import { GuideCard } from '../../components/GuideCard'
import { Mark } from '../../components/Mark'
import { Scrubber } from '../../components/Scrubber'
import { ShareCard, type ShareCardHandle } from '../../components/ShareCard'
import { Subtitles, type SubtitleMode } from '../../components/Subtitles'
import { Artwork, Button, Screen, Txt, clock } from '../../components/ui'
import { api, type ListenPayload } from '../../lib/api'
import { getEpisodeReady, type GetReadyStep } from '../../lib/episodeAudio'
import { loadLesson, readyPayload, saveLesson } from '../../lib/offline'
import { isOfflineError } from '../../lib/net'
import { plusInvite } from '../../lib/plusInvite'
import { skipAdTarget } from '../../lib/skipAd'
import { playerMenu } from '../../lib/playerMenu'
import { shareableLines, shareMessage, type ShareableLine } from '../../lib/shareLine'
import { config } from '../../lib/config'
import { demoAudio, demoVoice } from '../../demo/audio'
import { guideName, guidanceLevelOr, voicedGuideId } from '../../lib/languages'
import { goodbyeUrl, loadGoodbye, type Goodbye } from '../../lib/goodbye'
import { useSession } from '../../lib/session'
import { resumePosition, savePosition } from '../../lib/data'
import { listWords, saveWord } from '../../lib/words'
import { plog } from '../../lib/playbackLog'
import { expoGuideVoice, prepareGuideAudio } from '../../player/expoGuideVoice'
import { GuidedListen, type ListenState } from '../../player/GuidedListen'
import { setRemoteHandler } from '../../player/remote'
import { trackPlayerAudio } from '../../player/trackPlayerAudio'
import { MIN_TAP, space, usePalette } from '../../theme'

const RATES = [0.8, 1, 1.25] as const

function Control({ icon, label, onPress, size = 28, primary = false }: { icon: SFSymbol; label: string; onPress: () => void; size?: number; primary?: boolean }) {
  const p = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: primary ? 76 : MIN_TAP + 8,
        height: primary ? 76 : MIN_TAP + 8,
        borderRadius: 38,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? p.play : 'transparent',
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <SymbolView name={icon} size={size} tintColor={primary ? p.onAccent : p.text} />
    </Pressable>
  )
}

/** A tapped word: its meaning in this episode, and a button to keep it. */
function WordSheet({ word, onSave, onClose, saved }: { word?: { form: string; lemma: string; meaning?: string }; saved: boolean; onSave: () => void; onClose: () => void }) {
  const p = usePalette()
  return (
    <Modal visible={Boolean(word)} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} accessibilityLabel="Close" />
      {word ? (
        <View style={{ backgroundColor: p.raised, padding: space.lg, paddingBottom: space.xxl, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: space.sm }}>
          <Txt variant="heading">{word.form}</Txt>
          {word.lemma !== word.form ? (
            <Txt variant="small" tone="quiet">
              From “{word.lemma}”
            </Txt>
          ) : null}
          <Txt>{word.meaning ?? 'No meaning for this one yet.'}</Txt>
          <Button label={saved ? 'Saved to your words' : 'Save word'} kind={saved ? 'secondary' : 'primary'} disabled={saved || !word.meaning} onPress={onSave} style={{ marginTop: space.md }} />
        </View>
      ) : null}
    </Modal>
  )
}

/** A line the learner caught, as a card they can share: it credits the show and points to Polycast. */
function ShareLines({ lines, data }: { lines: ShareableLine[]; data: ListenPayload }) {
  const p = usePalette()
  const { profile } = useSession()
  const card = useRef<ShareCardHandle>(null)
  const [i, setI] = useState(0)
  const line = lines[Math.min(i, lines.length - 1)]!
  return (
    <View style={{ gap: space.sm }}>
      <Txt variant="heading">Share a line you caught</Txt>
      <View style={{ backgroundColor: p.raised, borderRadius: 18, padding: space.md, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Artwork uri={data.episode.image} size={44} radius={10} />
          <Txt variant="small" tone="quiet" numberOfLines={2} style={{ flex: 1 }}>
            Caught on Polycast, from {data.episode.podcastTitle}
          </Txt>
        </View>
        <Txt variant="bodyStrong">“{line.text}”</Txt>
        <Txt tone="quiet">{line.translation}</Txt>
      </View>
      {lines.length > 1 ? <Button kind="quiet" label="Another line" onPress={() => setI((n) => (n + 1) % lines.length)} /> : null}
      <Button
        kind="secondary"
        label="Share this line"
        onPress={() => {
          const message = shareMessage(line, data.episode.podcastTitle)
          if (card.current) void card.current.share(message)
          else void Share.share({ message }).catch(() => {})
        }}
      />
      <ShareCard ref={card} line={line} showTitle={data.episode.podcastTitle} flagId={profile?.flag_id} />
    </View>
  )
}

/** After the episode: the wrap-up questions and the words gathered on the way. */
function WrapUp({ data, savedThisListen, caughtAt, listenedSec, onDone }: { data: ListenPayload; savedThisListen: string[]; caughtAt: number[]; listenedSec: number; onDone: () => void }) {
  const p = usePalette()
  const questions = data.plan?.wrapUpQuestions ?? []
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const right = Object.entries(answers).filter(([i, a]) => questions[Number(i)]?.answerIndex === a).length
  const all = questions.length > 0 && Object.keys(answers).length === questions.length
  const invite = plusInvite(data.freeEpisode, listenedSec, savedThisListen.length)
  const lines = useMemo(() => shareableLines(data.transcript.segments, caughtAt), [data, caughtAt])
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <Mark height={44} />
      <Txt variant="title">You listened to {data.episode.title}</Txt>
      {questions.map((q, i) => (
        <View key={i} style={{ gap: space.sm }}>
          <Txt variant="bodyStrong">{q.prompt}</Txt>
          {q.options.map((opt, k) => {
            const chosen = answers[i] === k
            const reveal = answers[i] !== undefined
            const tone = reveal && k === q.answerIndex ? 'play' : chosen ? 'saved' : 'text'
            return (
              <Button key={k} kind="secondary" label={opt} disabled={reveal && !chosen && k !== q.answerIndex} onPress={() => !reveal && setAnswers((a) => ({ ...a, [i]: k }))} style={tone !== 'text' ? { borderColor: tone === 'play' ? p.play : p.saved } : undefined} />
            )
          })}
        </View>
      ))}
      {all ? <Txt variant="bodyStrong">{right === questions.length ? 'You followed all of that.' : `You got ${right} of ${questions.length}. That’s real listening, in a language you’re still learning.`}</Txt> : null}
      {savedThisListen.length ? (
        <View style={{ gap: space.xs }}>
          <Txt variant="heading">New words</Txt>
          <Txt tone="quiet">{savedThisListen.join(', ')}</Txt>
          <Txt variant="small" tone="faint">
            They’ll come back for a quick review tomorrow.
          </Txt>
        </View>
      ) : null}
      {lines.length ? <ShareLines lines={lines} data={data} /> : null}
      {invite ? (
        <View style={{ backgroundColor: p.raised, borderRadius: 18, padding: space.md, gap: space.sm }}>
          <Txt>{invite.summary}</Txt>
          <Button kind="secondary" label={invite.offer} onPress={() => router.push('/plus')} />
        </View>
      ) : null}
      <Button label="Done" onPress={onDone} />
    </ScrollView>
  )
}

export default function Listen() {
  const p = usePalette()
  const { id, guide, level: levelParam, from } = useLocalSearchParams<{ id: string; guide?: string; level?: string; from?: string }>()
  // The intensity chosen on the episode screen for this listen (PC-1017-F13).
  const chosenLevel = levelParam ? guidanceLevelOr(levelParam, 'standard') : undefined
  const { session, profile } = useSession()
  const [data, setData] = useState<ListenPayload>()
  const [error, setError] = useState<string>()
  const [state, setState] = useState<ListenState>({ phase: 'loading', position: 0, rate: 1 })
  const [mode, setMode] = useState<SubtitleMode>(profile?.subtitle_mode ?? 'both')
  const [oldFriends, setOldFriends] = useState<Set<number>>(new Set())
  const [tapped, setTapped] = useState<{ index: number; form: string; lemma: string; meaning?: string }>()
  const [saved, setSaved] = useState<string[]>([])
  // When in the episode the learner caught a word (saved it, or the guide taught it): lines to share.
  const [caughtAt, setCaughtAt] = useState<number[]>([])
  const [getReady, setGetReady] = useState<GetReadyStep>()
  const listen = useRef<GuidedListen | undefined>(undefined)
  const goodbye = useRef<Goodbye | undefined>(undefined)

  const clipText = useCallback(
    (c: Clip) =>
      (data?.transcript.words ?? [])
        .filter((w) => w.start >= c.start - 0.05 && w.end <= c.end + 0.05)
        .map((w) => w.text)
        .join(' '),
    [data],
  )

  const keepWord = useCallback(
    async (lemma: string, form: string, meaning: string, clip: Clip, sentence: string) => {
      if (!session || !data) return
      await saveWord(session.user.id, { lemma, form, meaning, language: data.transcript.language, episodeId: data.episode.id, clip, sentence }).catch(() => {})
      setSaved((s) => (s.includes(lemma) ? s : [...s, lemma]))
      setCaughtAt((c) => (c.includes(clip.start) ? c : [...c, clip.start]))
    },
    [session, data],
  )

  // Load the episode, its subtitles and (if guided) the lesson plan, then start playing.
  useEffect(() => {
    let disposed = false
    const abort = new AbortController()
    ;(async () => {
      try {
        let d: ListenPayload
        let synced = false
        const fetched = await api.listen(id, guide !== '0', chosenLevel).catch((e) => {
          // No connection, a time-out or the server's away: play the copy saved on this phone, if
          // there is one. A clear answer from the server (say, the show was removed) is shown instead.
          const saved = config.demo || !isOfflineError(e) ? undefined : loadLesson(id)
          if (!saved) throw e
          plog('offline: playing the lesson saved on this phone')
          return undefined
        })
        if (disposed) return
        if (fetched) {
          // Download the learner's own copy and line the lesson up with it (adverts can differ).
          const ready = config.demo ? undefined : await getEpisodeReady(fetched, (s) => !disposed && setGetReady(s), abort.signal)
          if (disposed) return
          d = ready ? readyPayload(fetched, ready) : fetched
          synced = Boolean(ready?.synced)
          // Keep it for offline listening (the guided version; subtitles-only leaves it alone).
          if (ready && guide !== '0') saveLesson(d)
        } else {
          const saved = loadLesson(id)!.payload
          // Offline, the saved plan holds every level, so the chosen one still applies.
          d = guide === '0' ? { ...saved, guided: false } : chosenLevel && saved.guided ? { ...saved, guidanceLevel: chosenLevel } : saved
          synced = true
        }
        setGetReady(undefined)
        setData(d)
        const level = d.guidanceLevel ?? 'standard'
        const moments: GuideMoment[] = d.guided && d.plan ? selectMoments(d.plan.moments, level) : []
        // A jump from the episode map starts there; otherwise carry on where the learner left off.
        const startAt = from !== undefined && Number.isFinite(Number(from)) ? Math.max(0, Number(from)) : await resumePosition(id)
        // The guide's sign-off, voiced ahead of time; fetched alongside, and simply skipped if it isn't there.
        goodbye.current = undefined
        if (!config.demo && moments.length > 0) {
          void loadGoodbye(goodbyeUrl(config.supabaseUrl, d.transcript.language, voicedGuideId(d.guideId, profile?.guide_id))).then((g) => (goodbye.current = g))
        }

        const l = new GuidedListen({
          audio: config.demo ? demoAudio(d.episode.durationSec) : trackPlayerAudio(),
          voice: config.demo ? demoVoice() : expoGuideVoice(),
          moments,
          segments: d.transcript.segments,
          onChange: setState,
          onSavePosition: (sec) => {
            if (session) void savePosition(session.user.id, id, sec)
          },
          inForeground: () => AppState.currentState === 'active',
          goodbye: () => goodbye.current,
        })
        listen.current = l
        setRemoteHandler((cmd) => void l.remote(cmd))
        plog(`listen: ${d.episode.title} (${synced ? 'lined up with this copy' : 'lesson times as prepared'}, ${moments.length} guide moments, from ${startAt.toFixed(0)}s)`)
        if (!config.demo) await prepareGuideAudio()
        await l.start({ url: d.episode.audioUrl, title: d.episode.title, artist: d.episode.podcastTitle, artwork: d.episode.image ?? undefined, durationSec: d.episode.durationSec }, startAt)

        const known = await listWords(d.transcript.language).catch(() => [])
        if (!disposed) setOldFriends(new Set(findOldFriends(d.transcript.words, known, d.episode.id, d.transcript.language).map((f) => f.wordIndex)))
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : 'This episode won’t play right now.')
      }
    })()
    return () => {
      disposed = true
      abort.abort()
      setRemoteHandler(undefined)
      void listen.current?.dispose()
    }
  }, [id, guide, chosenLevel, from, session])

  // Hands-free saving: a word the guide teaches goes into the word bank when it's spotlighted.
  useEffect(() => {
    const m = state.moment
    if (state.phase === 'guide' && m?.kind === 'spotlight' && m.term && m.clips[0]) {
      const sentence = data?.transcript.segments.find((s) => s.start <= m.clips[0]!.start && s.end >= m.clips[0]!.end)?.text ?? ''
      void keepWord(m.term.lemma, m.term.text, m.term.meaning, m.clips[0], sentence)
    }
  }, [state.phase, state.moment, data, keepWord])

  // Finished: mark the listen done.
  useEffect(() => {
    if (state.phase === 'finished' && session) void savePosition(session.user.id, id, state.position, true)
  }, [state.phase, session, id])

  // The introduction plays once at the start; this brings it back whenever the learner wants it.
  const intro = useMemo(() => (data?.guided ? data.plan?.moments.find((m) => m.kind === 'warmup' && m.audio) : undefined), [data])
  const markers = useMemo(() => (data?.plan && data.guided ? selectMoments(data.plan.moments, data.guidanceLevel ?? 'standard').map((m) => m.at) : []), [data])
  const close = () => router.back()

  if (error) {
    return (
      <Screen edges={['top', 'bottom']} style={{ padding: space.lg, gap: space.md, justifyContent: 'center' }}>
        <Txt variant="heading">This episode won’t play</Txt>
        <Txt tone="quiet">{error}</Txt>
        <Button label="Close" onPress={close} />
      </Screen>
    )
  }
  if (!data) {
    return (
      <Screen edges={['top', 'bottom']} style={{ padding: space.lg, gap: space.md, justifyContent: 'center', alignItems: 'center' }}>
        <Mark height={44} flagId={profile?.flag_id} speaking accessibilityLabel="Loading" />
        {getReady ? (
          <View style={{ gap: space.xs, alignItems: 'center' }}>
            <Txt variant="heading">
              {getReady.step === 'downloading' ? 'Downloading the episode' : getReady.step === 'guide' ? `Getting ${guideName(profile?.guide_id)} ready` : 'Lining up your lesson'}
            </Txt>
            <Txt tone="quiet" style={{ textAlign: 'center' }}>
              {getReady.step === 'downloading'
                ? `${Math.round(getReady.progress * 100)}%. It stays on your phone, so you can listen offline too.`
                : getReady.step === 'guide'
                  ? `${Math.round(getReady.progress * 100)}%. Saving what ${guideName(profile?.guide_id)} says, so it starts the moment it's needed.`
                  : 'Matching the subtitles and the guide to your copy of the episode.'}
            </Txt>
          </View>
        ) : null}
        <Button kind="secondary" label="Cancel" onPress={close} />
      </Screen>
    )
  }
  if (state.phase === 'finished') return <Screen edges={['top', 'bottom']}><WrapUp data={data} savedThisListen={saved} caughtAt={caughtAt} listenedSec={Math.min(state.position, data.episode.durationSec)} onDone={close} /></Screen>

  const l = listen.current
  const guideOn = state.phase === 'guide' || state.phase === 'question'
  const playing = state.phase === 'playing' || guideOn
  const advert = advertAt(data.adverts, state.position)
  const skipAd = skipAdTarget(data.adverts, state.position)
  // Quieter actions live in the More menu, not among the main controls (PC-1017-F06).
  const menu = playerMenu({ hasIntro: Boolean(intro), guideSpeaking: guideOn })
  const runMenu = (i: number) => {
    if (menu.actions[i] === 'replayIntro' && intro) void l?.replayMoment(intro)
  }
  const openMenu = () => {
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: menu.options, cancelButtonIndex: menu.cancelIndex }, runMenu)
    else Alert.alert('More', undefined, [...menu.actions.map((_, i) => ({ text: menu.options[i]!, onPress: () => runMenu(i) })), { text: 'Cancel', style: 'cancel' as const }])
  }
  const nextMode: Record<SubtitleMode, SubtitleMode> = { both: 'target', target: 'none', none: 'both' }
  const modeLabel: Record<SubtitleMode, string> = { both: 'Both languages', target: 'Target language only', none: 'Subtitles off' }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, gap: space.sm }}>
        <Control icon="chevron.down" label="Close the player" onPress={close} size={22} />
        <View style={{ flex: 1 }}>
          <Txt variant="smallStrong" numberOfLines={1}>
            {data.episode.title}
          </Txt>
          <Txt variant="small" tone="quiet" numberOfLines={1}>
            {data.episode.podcastTitle}
          </Txt>
        </View>
        <Artwork uri={data.episode.image} size={40} radius={8} />
        {menu.actions.length ? <Control icon="ellipsis.circle" label="More" onPress={openMenu} size={22} /> : null}
      </View>

      {!data.guided && guide !== '0' ? (
        <Txt variant="small" tone="quiet" style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
          You’ve used this week’s guided episode. Subtitles are on; Plus brings the guide to every episode.
        </Txt>
      ) : null}

      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
        {advert && !guideOn ? (
          <View style={{ alignItems: 'center', gap: space.xs, paddingHorizontal: space.lg }}>
            <Txt tone="quiet">Advert break</Txt>
            <Txt variant="small" tone="faint" style={{ textAlign: 'center' }}>
              {guideName(voicedGuideId(data?.guideId, profile?.guide_id))} waits it out. The lesson picks up after, in {clock(advert.end - state.position)}.
            </Txt>
          </View>
        ) : null}
        {segmentAt(data.transcript.segments, state.position) < 0 ? (
          <View style={{ alignItems: 'center' }}>
            <Artwork uri={data.episode.image} size={guideOn ? 168 : 260} radius={22} />
          </View>
        ) : null}
        <Subtitles
          segments={data.transcript.segments}
          words={data.transcript.words}
          position={state.position}
          mode={mode}
          oldFriends={oldFriends}
          onWord={(index) => {
            const w = data.transcript.words[index]
            if (!w) return
            const form = normalizeToken(w.text, data.transcript.language)
            const g = data.transcript.glossary?.[form]
            setTapped({ index, form: w.text.replace(/[.,!?;:"“”»«]+$/u, ''), lemma: g?.lemma ?? form, meaning: g?.meaning })
          }}
        />
      </View>

      <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
        {guideOn && state.goodbye ? (
          <View accessible accessibilityLabel={`${guideName(voicedGuideId(data?.guideId, profile?.guide_id))} says ${state.goodbye.text}, meaning ${state.goodbye.meaning}`} style={{ alignItems: 'center', gap: space.xs, paddingVertical: space.md }}>
            <Mark height={28} flagId={profile?.flag_id} speaking accessibilityLabel="" />
            <Txt variant="heading" style={{ textAlign: 'center' }}>
              {state.goodbye.text}
            </Txt>
            <Txt tone="quiet" style={{ textAlign: 'center' }}>
              {state.goodbye.meaning}
            </Txt>
          </View>
        ) : null}
        {guideOn && state.moment ? (
          <GuideCard
            moment={state.moment}
            guideName={guideName(voicedGuideId(data?.guideId, profile?.guide_id))}
            flagId={profile?.flag_id ?? 'polycast'}
            clipText={clipText}
            answer={state.answer}
            onAnswer={(i) => l?.answer(i)}
            onSkip={() => l?.skipGuide()}
          />
        ) : null}

        {!guideOn && state.next && data.guided ? (
          <NextGuide guideName={guideName(voicedGuideId(data?.guideId, profile?.guide_id))} flagId={profile?.flag_id} seconds={(state.next.at - state.position) / (state.rate || 1)} />
        ) : null}

        {skipAd && !guideOn ? <SkipAdPill onPress={() => void l?.seek(skipAd.resumeAt)} /> : null}

        <Scrubber position={state.position} duration={data.episode.durationSec} markers={markers} adverts={data.adverts} onSeek={(s) => void l?.seek(s)} />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Control icon="text.bubble" label={`Subtitles: ${modeLabel[mode]}. Change`} onPress={() => setMode(nextMode[mode])} size={22} />
          <Control icon="gobackward" label="Replay the last line" onPress={() => void l?.replayLine()} />
          <Control icon={playing ? 'pause.fill' : 'play.fill'} label={playing ? 'Pause' : 'Play'} primary size={30} onPress={() => void (playing ? l?.pause() : l?.resume())} />
          <Control icon="goforward.30" label="Forward 30 seconds" onPress={() => void l?.seek(state.position + 30)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Speed ${state.rate} times. Change`}
            onPress={() => void l?.setRate(RATES[(RATES.indexOf(state.rate as (typeof RATES)[number]) + 1) % RATES.length]!)}
            style={{ width: MIN_TAP + 8, height: MIN_TAP + 8, alignItems: 'center', justifyContent: 'center' }}
          >
            <Txt variant="smallStrong">{state.rate}×</Txt>
          </Pressable>
        </View>
      </View>

      <WordSheet
        word={tapped}
        saved={Boolean(tapped && saved.includes(tapped.lemma))}
        onClose={() => setTapped(undefined)}
        onSave={() => {
          if (!tapped?.meaning) return
          const w = data.transcript.words
          const occ = { first: tapped.index, last: tapped.index, start: w[tapped.index]!.start, end: w[tapped.index]!.end }
          const sentence = data.transcript.segments.find((s) => tapped.index >= s.wordStart && tapped.index < s.wordEnd)?.text ?? ''
          void keepWord(tapped.lemma, tapped.form, tapped.meaning, wordClip(w, occ), sentence)
        }}
      />
    </Screen>
  )
}

/** A quiet countdown to the guide's next moment, so it never takes the learner by surprise. */
/** Spotify's pattern, which listeners already know (PC-1017-F05): a clear pill above the scrubber during an advert. */
function SkipAdPill({ onPress }: { onPress: () => void }) {
  const p = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Skip ad"
      accessibilityHint="Jumps to where the episode carries on"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        alignSelf: 'flex-end',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        minHeight: MIN_TAP - 8,
        paddingHorizontal: space.md,
        borderRadius: 999,
        backgroundColor: p.text,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Txt variant="smallStrong" style={{ color: p.bg }}>
        Skip ad
      </Txt>
      <SymbolView name="forward.end.fill" size={14} tintColor={p.bg} />
    </Pressable>
  )
}

function NextGuide({ guideName, flagId, seconds }: { guideName: string; flagId?: string; seconds: number }) {
  const s = Math.max(0, Math.ceil(seconds))
  // Whole seconds only, and only the last 10 every second: a ticking clock is a distraction.
  const label = s <= 10 ? `${guideName} is about to step in` : `${guideName} in ${clock(s)}`
  return (
    <View
      accessible
      accessibilityLabel={s <= 10 ? `${guideName} is about to step in` : `${guideName} steps in after ${clock(s)}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'center' }}
    >
      <Mark height={16} flagId={flagId} speaking={s <= 10} accessibilityLabel="" />
      <Txt variant="small" tone="quiet">
        {label}
      </Txt>
    </View>
  )
}
