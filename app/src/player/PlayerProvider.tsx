import AsyncStorage from '@react-native-async-storage/async-storage'
import { findOldFriends, guideVolume, selectMoments, type Clip, type GuideMoment } from '@polycast/core'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { demoAudio, demoVoice } from '../demo/audio'
import { api, type ListenPayload } from '../lib/api'
import { config } from '../lib/config'
import { resumePosition, savePosition } from '../lib/data'
import { getEpisodeReady, type GetReadyStep } from '../lib/episodeAudio'
import { goodbyeUrl, loadGoodbye, type Goodbye } from '../lib/goodbye'
import { voicedGuideId } from '../lib/languages'
import { isOfflineError } from '../lib/net'
import { loadLesson, localPosition, readyPayload, saveLesson } from '../lib/offline'
import { plog } from '../lib/playbackLog'
import { useSession } from '../lib/session'
import { listWords, saveWord } from '../lib/words'
import { expoGuideVoice, prepareGuideAudio } from './expoGuideVoice'
import { GuidedListen, type ListenState } from './GuidedListen'
import { setRemoteHandler } from './remote'
import { LAST_PLAYED_KEY, miniPlayerView, openDecision, parseLastPlayed, sessionKey, type LastPlayed, type ListenParams, type MiniPlayerView } from './session'
import { trackPlayerAudio } from './trackPlayerAudio'

/**
 * The listen in progress, held above the screens (PC-1017-F04): swiping the full player away
 * leaves it playing, the mini-player above the tabs controls it, and opening the player again
 * re-attaches to it. The last episode is kept on the phone, so after the app is closed and opened
 * again it waits in the mini-player, paused at its saved position (PC-1017-F02).
 */
export interface Player {
  params?: ListenParams
  data?: ListenPayload
  state: ListenState
  error?: string
  getReady?: GetReadyStep
  listen?: GuidedListen
  /** Lemmas saved during this listen, and when in the episode a word was caught (for sharing a line). */
  saved: string[]
  caughtAt: number[]
  oldFriends: Set<number>
  mini: MiniPlayerView
  /** Opens (or re-attaches to) a listen; plays from where the learner left off unless `from` is given. */
  open: (p: ListenParams) => void
  /** Ends the listen in progress (Cancel while loading, Done on the wrap-up, an error). */
  stop: () => void
  /** One tap on the mini-player: pause, play, or carry on with the last episode in the background. */
  toggle: () => void
  /** True once the word is really in the bank; false if saving failed (PC-1018-02). */
  keepWord: (lemma: string, form: string, meaning: string, clip: Clip, sentence: string) => Promise<boolean>
}

const LOADING: ListenState = { phase: 'loading', position: 0, rate: 1 }
const PlayerContext = createContext<Player | undefined>(undefined)

export function usePlayer(): Player {
  const p = useContext(PlayerContext)
  if (!p) throw new Error('usePlayer outside PlayerProvider')
  return p
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useSession()
  const [params, setParams] = useState<ListenParams>()
  const [data, setData] = useState<ListenPayload>()
  const [state, setState] = useState<ListenState>(LOADING)
  const [error, setError] = useState<string>()
  const [getReady, setGetReady] = useState<GetReadyStep>()
  const [saved, setSaved] = useState<string[]>([])
  const [caughtAt, setCaughtAt] = useState<number[]>([])
  const [oldFriends, setOldFriends] = useState<Set<number>>(new Set())
  const [last, setLast] = useState<LastPlayed>()
  const listen = useRef<GuidedListen | undefined>(undefined)
  const goodbye = useRef<Goodbye | undefined>(undefined)
  const run = useRef<{ key: string; abort: AbortController; disposed: boolean } | undefined>(undefined)
  const profileRef = useRef(profile)
  profileRef.current = profile
  const sessionRef = useRef(session)
  sessionRef.current = session
  const errorRef = useRef<string | undefined>(undefined)
  errorRef.current = error

  // The last episode, from the last time the app was open.
  useEffect(() => {
    if (config.demo) return
    AsyncStorage.getItem(LAST_PLAYED_KEY)
      .then((raw) => setLast((l) => l ?? parseLastPlayed(raw)))
      .catch(() => {})
  }, [])
  const remember = useCallback((l: LastPlayed | undefined) => {
    setLast(l)
    if (config.demo) return
    void (l ? AsyncStorage.setItem(LAST_PLAYED_KEY, JSON.stringify(l)) : AsyncStorage.removeItem(LAST_PLAYED_KEY)).catch(() => {})
  }, [])

  const teardown = useCallback(() => {
    if (run.current) {
      run.current.disposed = true
      run.current.abort.abort()
    }
    run.current = undefined
    setRemoteHandler(undefined)
    const l = listen.current
    listen.current = undefined
    void l?.dispose()
  }, [])

  const start = useCallback(
    (p: ListenParams) => {
      teardown()
      const r = { key: sessionKey(p), abort: new AbortController(), disposed: false }
      run.current = r
      setParams(p)
      setData(undefined)
      setError(undefined)
      setGetReady(undefined)
      setState(LOADING)
      setSaved([])
      setCaughtAt([])
      setOldFriends(new Set())
      const { id, guide, level: chosenLevel, from } = p
      ;(async () => {
        try {
          let d: ListenPayload
          let synced = false
          const fetched = await api.listen(id, guide !== '0', chosenLevel).catch((e) => {
            // No connection, a time-out or the server's away: play the copy saved on this phone, if
            // there is one. A clear answer from the server (say, the show was removed) is shown instead.
            const savedLesson = config.demo || !isOfflineError(e) ? undefined : loadLesson(id)
            if (!savedLesson) throw e
            plog('offline: playing the lesson saved on this phone')
            return undefined
          })
          if (r.disposed) return
          if (fetched) {
            // Download the learner's own copy and line the lesson up with it (adverts can differ).
            const ready = config.demo ? undefined : await getEpisodeReady(fetched, (s) => !r.disposed && setGetReady(s), r.abort.signal)
            if (r.disposed) return
            d = ready ? readyPayload(fetched, ready) : fetched
            synced = Boolean(ready?.synced)
            // Keep it for offline listening (the guided version; subtitles-only leaves it alone).
            if (ready && guide !== '0') saveLesson(d)
          } else {
            const savedLesson = loadLesson(id)!.payload
            // Offline, the saved plan holds every level, so the chosen one still applies.
            d = guide === '0' ? { ...savedLesson, guided: false } : chosenLevel && savedLesson.guided ? { ...savedLesson, guidanceLevel: chosenLevel } : savedLesson
            synced = true
          }
          setGetReady(undefined)
          setData(d)
          remember({ id, title: d.episode.title, podcastTitle: d.episode.podcastTitle, image: d.episode.image, durationSec: d.episode.durationSec, guide, level: chosenLevel })
          const level = d.guidanceLevel ?? 'standard'
          const moments: GuideMoment[] = d.guided && d.plan ? selectMoments(d.plan.moments, level) : []
          // A jump from the episode map starts there; otherwise carry on where the learner left off.
          const startAt = from !== undefined ? from : await resumePosition(id)
          if (r.disposed) return
          // The guide's sign-off, voiced ahead of time; fetched alongside, and simply skipped if it isn't there.
          goodbye.current = undefined
          if (!config.demo && moments.length > 0) {
            void loadGoodbye(goodbyeUrl(config.supabaseUrl, d.transcript.language, voicedGuideId(d.guideId, profileRef.current?.guide_id))).then((g) => (goodbye.current = g))
          }

          const l = new GuidedListen({
            audio: config.demo ? demoAudio(d.episode.durationSec) : trackPlayerAudio(),
            voice: config.demo ? demoVoice() : expoGuideVoice({ volume: guideVolume(d.plan?.loudnessLufs) }),
            moments,
            segments: d.transcript.segments,
            onChange: (s) => !r.disposed && setState(s),
            onSavePosition: (sec) => {
              const s = sessionRef.current
              if (s) void savePosition(s.user.id, id, sec)
            },
            inForeground: () => AppState.currentState === 'active',
            goodbye: () => goodbye.current,
          })
          listen.current = l
          setRemoteHandler((cmd) => void l.remote(cmd))
          plog(`listen: ${d.episode.title} (${synced ? 'lined up with this copy' : 'lesson times as prepared'}, ${moments.length} guide moments, from ${startAt.toFixed(0)}s)`)
          if (!config.demo) await prepareGuideAudio()
          if (r.disposed) return
          await l.start({ url: d.episode.audioUrl, title: d.episode.title, artist: d.episode.podcastTitle, artwork: d.episode.image ?? undefined, durationSec: d.episode.durationSec }, startAt)
          const known = await listWords(d.transcript.language).catch(() => [])
          if (!r.disposed) setOldFriends(new Set(findOldFriends(d.transcript.words, known, d.episode.id, d.transcript.language).map((f) => f.wordIndex)))
        } catch (e) {
          if (!r.disposed) setError(e instanceof Error ? e.message : 'This episode won’t play right now.')
        }
      })()
    },
    [teardown, remember],
  )

  const open = useCallback(
    (p: ListenParams) => {
      const decision = openDecision(run.current?.key, p, Boolean(errorRef.current))
      if (decision === 'reuse') return
      if (decision === 'seek') {
        setParams(p)
        void listen.current?.seek(p.from!)
        return
      }
      start(p)
    },
    [start],
  )

  const stop = useCallback(() => {
    teardown()
    setParams(undefined)
    setData(undefined)
    setError(undefined)
    setGetReady(undefined)
    setState(LOADING)
  }, [teardown])

  // Signing out ends any listen.
  useEffect(() => {
    if (!session) stop()
  }, [session, stop])

  const keepWord = useCallback(
    async (lemma: string, form: string, meaning: string, clip: Clip, sentence: string) => {
      const s = sessionRef.current
      if (!s || !data) return false
      try {
        await saveWord(s.user.id, { lemma, form, meaning, language: data.transcript.language, episodeId: data.episode.id, clip, sentence })
      } catch {
        return false // never shown as saved when it isn't
      }
      setSaved((v) => (v.includes(lemma) ? v : [...v, lemma]))
      setCaughtAt((c) => (c.includes(clip.start) ? c : [...c, clip.start]))
      return true
    },
    [data],
  )

  // Hands-free saving: a word the guide teaches goes into the word bank when it's spotlighted,
  // whether or not the full player is on screen.
  useEffect(() => {
    const m = state.moment
    if (state.phase === 'guide' && m?.kind === 'spotlight' && m.term && m.clips[0]) {
      const sentence = data?.transcript.segments.find((s) => s.start <= m.clips[0]!.start && s.end >= m.clips[0]!.end)?.text ?? ''
      void keepWord(m.term.lemma, m.term.text, m.term.meaning, m.clips[0], sentence)
    }
  }, [state.phase, state.moment, data, keepWord])

  // Finished: mark the listen done, and stop offering it in the mini-player next time.
  useEffect(() => {
    if (state.phase !== 'finished' || !params) return
    const s = sessionRef.current
    if (s) void savePosition(s.user.id, params.id, state.position, true)
    if (last?.id === params.id) remember(undefined)
  }, [state.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const mini = useMemo(
    () =>
      miniPlayerView(
        params ? { id: params.id, title: data?.episode.title, podcastTitle: data?.episode.podcastTitle, image: data?.episode.image, durationSec: data?.episode.durationSec, phase: state.phase, position: state.position, failed: Boolean(error) } : undefined,
        last,
        last && !params ? (config.demo ? 0 : localPosition(last.id)) : undefined,
      ),
    [params, data, state.phase, state.position, error, last],
  )

  const toggle = useCallback(() => {
    if (mini.kind === 'resume' && last) return open({ id: last.id, guide: last.guide, level: last.level })
    const l = listen.current
    if (mini.kind !== 'live' || !l) return
    void (mini.playing ? l.pause() : l.resume())
  }, [mini, last, open])

  const value: Player = { params, data, state, error, getReady, listen: listen.current, saved, caughtAt, oldFriends, mini, open, stop, toggle, keepWord }
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}
