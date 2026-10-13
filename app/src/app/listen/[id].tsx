import { findOldFriends, normalizeToken, segmentAt, selectMoments, wordClip, type Clip, type GuideMoment } from '@polycast/core'
import { router, useLocalSearchParams } from 'expo-router'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { GuideCard } from '../../components/GuideCard'
import { Mark } from '../../components/Mark'
import { Scrubber } from '../../components/Scrubber'
import { Subtitles, type SubtitleMode } from '../../components/Subtitles'
import { Artwork, Button, Screen, Txt } from '../../components/ui'
import { api, type ListenPayload } from '../../lib/api'
import { getEpisodeReady, type GetReadyStep } from '../../lib/episodeAudio'
import { config } from '../../lib/config'
import { demoAudio, demoVoice } from '../../demo/audio'
import { guideName } from '../../lib/languages'
import { useSession } from '../../lib/session'
import { resumePosition, savePosition } from '../../lib/data'
import { listWords, saveWord } from '../../lib/words'
import { expoGuideVoice } from '../../player/expoGuideVoice'
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

/** After the episode: the wrap-up questions and the words gathered on the way. */
function WrapUp({ data, savedThisListen, onDone }: { data: ListenPayload; savedThisListen: string[]; onDone: () => void }) {
  const p = usePalette()
  const questions = data.plan?.wrapUpQuestions ?? []
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const right = Object.entries(answers).filter(([i, a]) => questions[Number(i)]?.answerIndex === a).length
  const all = questions.length > 0 && Object.keys(answers).length === questions.length
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
      <Button label="Done" onPress={onDone} />
    </ScrollView>
  )
}

export default function Listen() {
  const p = usePalette()
  const { id, guide } = useLocalSearchParams<{ id: string; guide?: string }>()
  const { session, profile } = useSession()
  const [data, setData] = useState<ListenPayload>()
  const [error, setError] = useState<string>()
  const [state, setState] = useState<ListenState>({ phase: 'loading', position: 0, rate: 1 })
  const [mode, setMode] = useState<SubtitleMode>(profile?.subtitle_mode ?? 'both')
  const [oldFriends, setOldFriends] = useState<Set<number>>(new Set())
  const [tapped, setTapped] = useState<{ index: number; form: string; lemma: string; meaning?: string }>()
  const [saved, setSaved] = useState<string[]>([])
  const [getReady, setGetReady] = useState<GetReadyStep>()
  const listen = useRef<GuidedListen | undefined>(undefined)

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
    },
    [session, data],
  )

  // Load the episode, its subtitles and (if guided) the lesson plan, then start playing.
  useEffect(() => {
    let disposed = false
    const abort = new AbortController()
    ;(async () => {
      try {
        const fetched = await api.listen(id, guide !== '0')
        if (disposed) return
        // Download the learner's own copy and line the lesson up with it (adverts can differ).
        const ready = config.demo ? undefined : await getEpisodeReady(fetched, (s) => !disposed && setGetReady(s), abort.signal)
        if (disposed) return
        setGetReady(undefined)
        const d: ListenPayload = ready
          ? { ...fetched, transcript: ready.transcript, plan: ready.plan, episode: { ...fetched.episode, audioUrl: ready.url, durationSec: ready.durationSec } }
          : fetched
        setData(d)
        const level = d.guidanceLevel ?? 'standard'
        const moments: GuideMoment[] = d.guided && d.plan ? selectMoments(d.plan.moments, level) : []
        const startAt = await resumePosition(id)

        const l = new GuidedListen({
          audio: config.demo ? demoAudio(d.episode.durationSec) : trackPlayerAudio(),
          voice: config.demo ? demoVoice() : expoGuideVoice(),
          moments,
          segments: d.transcript.segments,
          onChange: setState,
          onSavePosition: (sec) => {
            if (session) void savePosition(session.user.id, id, sec)
          },
        })
        listen.current = l
        setRemoteHandler((cmd) => void l.remote(cmd))
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
  }, [id, guide, session])

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
        <Mark height={44} />
        {getReady ? (
          <View style={{ gap: space.xs, alignItems: 'center' }}>
            <Txt variant="heading">{getReady.step === 'downloading' ? 'Downloading the episode' : 'Lining up your lesson'}</Txt>
            <Txt tone="quiet" style={{ textAlign: 'center' }}>
              {getReady.step === 'downloading'
                ? `${Math.round(getReady.progress * 100)}%. It stays on your phone, so you can listen offline too.`
                : 'Matching the subtitles and the guide to your copy of the episode.'}
            </Txt>
          </View>
        ) : null}
        <Button kind="secondary" label="Cancel" onPress={close} />
      </Screen>
    )
  }
  if (state.phase === 'finished') return <Screen edges={['top', 'bottom']}><WrapUp data={data} savedThisListen={saved} onDone={close} /></Screen>

  const l = listen.current
  const guideOn = state.phase === 'guide' || state.phase === 'question'
  const playing = state.phase === 'playing' || guideOn
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
      </View>

      {intro && !guideOn ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void l?.replayMoment(intro)}
          hitSlop={8}
          style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: MIN_TAP, justifyContent: 'center', paddingHorizontal: space.lg, opacity: pressed ? 0.6 : 1 })}
        >
          <Txt variant="smallStrong" tone="quiet">
            Hear the introduction again
          </Txt>
        </Pressable>
      ) : null}

      {!data.guided && guide !== '0' ? (
        <Txt variant="small" tone="quiet" style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
          You’ve used this week’s guided episode. Subtitles are on; Plus brings the guide to every episode.
        </Txt>
      ) : null}

      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
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
        {guideOn && state.moment ? (
          <GuideCard
            moment={state.moment}
            guideName={guideName(profile?.guide_id)}
            flagId={profile?.flag_id ?? 'polycast'}
            clipText={clipText}
            answer={state.answer}
            onAnswer={(i) => l?.answer(i)}
            onSkip={() => l?.skipGuide()}
          />
        ) : null}

        <Scrubber position={state.position} duration={data.episode.durationSec} markers={markers} onSeek={(s) => void l?.seek(s)} />

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
