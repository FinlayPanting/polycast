import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { getApiKeys, getPreferences, savePreferences, getCachedEpisodeAsync, type ProcessedEpisode, type TranscriptLine } from '../lib/storage'
import { runPipeline, type PipelineStage, type PipelineProgress } from '../lib/pipeline'
import { AudioEngine, type AudioEngineMeta } from '../lib/audio-engine'
import { getEpisodeNav } from '../lib/nav-state'
import type { Episode } from '../lib/rss'
import type { ItunesResult } from '../lib/itunes'

export const Route = createFileRoute('/episode/$id')({
  component: EpisodeScreen,
})

type Screen = 'setup' | 'processing' | 'player'

const LANGUAGES = [
  'Swedish', 'Spanish', 'German', 'French', 'Italian', 'Portuguese',
  'Dutch', 'Norwegian', 'Danish', 'Polish', 'Japanese', 'Mandarin', 'Korean',
]

const MIN_OPTIONS = [
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
]

const MAX_OPTIONS = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
]

function EpisodeScreen() {
  const { id } = Route.useParams()
  const navigate = useNavigate()

  const nav = getEpisodeNav(id)
  const episode = nav?.episode
  const podcast = nav?.podcast

  const [screen, setScreen] = useState<Screen>('setup')
  const [processed, setProcessed] = useState<ProcessedEpisode | null>(null)
  const [language, setLanguage] = useState('Swedish')
  const prefs = getPreferences()
  const [summaryMin, setSummaryMin] = useState(prefs.summaryMin)
  const [summaryMax, setSummaryMax] = useState(prefs.summaryMax)

  useEffect(() => {
    if (!episode) return
    getCachedEpisodeAsync(episode.guid).then((cached) => {
      if (cached) { setProcessed(cached); setScreen('player') }
    })
  }, [episode?.guid])

  if (!episode || !podcast) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-8 text-center gap-4">
        <p className="text-zinc-400 text-sm">Episode data missing. Go back and try again.</p>
        <button onClick={() => navigate({ to: '/' })} className="text-brand text-sm">Go home</button>
      </div>
    )
  }

  if (screen === 'setup') {
    return (
      <SetupScreen
        episode={episode}
        podcast={podcast}
        language={language}
        summaryMin={summaryMin}
        summaryMax={summaryMax}
        onLanguageChange={setLanguage}
        onSummaryMinChange={(v) => setSummaryMin(v)}
        onSummaryMaxChange={(v) => setSummaryMax(v)}
        onStart={() => setScreen('processing')}
      />
    )
  }

  if (screen === 'processing') {
    return (
      <ProcessingScreen
        episode={episode}
        podcast={podcast}
        language={language}
        summaryMin={summaryMin}
        summaryMax={summaryMax}
        onDone={(data) => { setProcessed(data); setScreen('player') }}
        onBack={() => setScreen('setup')}
      />
    )
  }

  if (screen === 'player' && processed) {
    return <PlayerScreen episode={episode} podcast={podcast} processed={processed} />
  }

  return null
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function SetupScreen({
  episode, podcast, language, summaryMin, summaryMax,
  onLanguageChange, onSummaryMinChange, onSummaryMaxChange, onStart,
}: {
  episode: Episode; podcast: ItunesResult
  language: string; summaryMin: number; summaryMax: number
  onLanguageChange: (l: string) => void
  onSummaryMinChange: (v: number) => void
  onSummaryMaxChange: (v: number) => void
  onStart: () => void
}) {
  const navigate = useNavigate()
  const estimatedMb = (episode.enclosureLength ?? 0) / 1_000_000
  const isLong = estimatedMb > 30 // warn (but don't block) for episodes likely needing chunked transcription

  function handleGenerate() {
    const keys = getApiKeys()
    if (!keys.openai || !keys.elevenlabs) {
      navigate({ to: '/settings', search: { missing: true } })
      return
    }
    onStart()
  }

  return (
    <div className="flex flex-col px-5 gap-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}>
      <button
        onClick={() => navigate({ to: '/podcast/$id', params: { id: String(podcast.collectionId) } })}
        className="flex items-center gap-1 text-brand text-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="flex gap-4 items-start">
        <img
          src={podcast.artworkUrl100}
          alt={podcast.collectionName}
          className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
        />
        <div className="min-w-0">
          <p className="text-xs text-zinc-500 mb-1">{podcast.collectionName}</p>
          <h1 className="text-base font-semibold text-white leading-snug line-clamp-3">{episode.title}</h1>
        </div>
      </div>

      {isLong && (
        <div className="bg-white/4 border border-white/10 rounded-xl p-4">
          <p className="text-zinc-400 text-sm">Long episode — transcription will be split into chunks automatically. This will take a few minutes.</p>
        </div>
      )}

      <div>
        <label className="block text-sm text-zinc-400 mb-2">Episode language</label>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-brand/50 transition-colors appearance-none"
        >
          {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-3">
        <label className="block text-sm text-zinc-400">Summary window</label>
        <div>
          <p className="text-xs text-zinc-600 mb-1.5">Minimum gap</p>
          <div className="grid grid-cols-4 gap-2">
            {MIN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onSummaryMinChange(opt.value); if (summaryMax <= opt.value) onSummaryMaxChange(opt.value + 60) }}
                className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                  summaryMin === opt.value
                    ? 'bg-brand/15 border-brand text-brand'
                    : 'bg-white/4 border-white/10 text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-zinc-600 mb-1.5">Maximum gap</p>
          <div className="grid grid-cols-4 gap-2">
            {MAX_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                disabled={opt.value <= summaryMin}
                onClick={() => onSummaryMaxChange(opt.value)}
                className={`py-2 rounded-xl text-sm font-medium border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                  summaryMax === opt.value
                    ? 'bg-brand/15 border-brand text-brand'
                    : 'bg-white/4 border-white/10 text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-zinc-600">Summaries will appear at natural sentence pauses within this range.</p>
      </div>

      <button
        onClick={handleGenerate}
        className="w-full py-3.5 bg-brand text-black font-semibold rounded-xl transition-all active:scale-[0.98] mt-auto"
      >
        Generate &amp; Listen
      </button>
    </div>
  )
}

// ─── Processing ──────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<PipelineStage, string> = {
  download: 'Downloading episode',
  transcribe: 'Transcribing with Whisper',
  translate: 'Translating transcript',
  summarize: 'Generating summaries',
  tts: 'Synthesising voiceovers',
  build: 'Building audio timeline',
}

const STAGE_ORDER: PipelineStage[] = ['download', 'transcribe', 'translate', 'summarize', 'tts', 'build']

function ProcessingScreen({
  episode, podcast, language, summaryMin, summaryMax, onDone, onBack,
}: {
  episode: Episode; podcast: ItunesResult
  language: string; summaryMin: number; summaryMax: number
  onDone: (data: ProcessedEpisode) => void
  onBack: () => void
}) {
  type StageStatus = 'pending' | 'active' | 'done' | 'error'
  const [stages, setStages] = useState<Record<PipelineStage, StageStatus>>({
    download: 'pending', transcribe: 'pending', translate: 'pending', summarize: 'pending', tts: 'pending', build: 'pending',
  })
  const [currentStage, setCurrentStage] = useState<PipelineStage>('download')
  const [stageProgress, setStageProgress] = useState(0)
  const [stageDetail, setStageDetail] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Keep screen awake during processing so iOS doesn't throttle network
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock.request('screen').then((l) => { lock = l }).catch(() => {})
    return () => { lock?.release().catch(() => {}) }
  }, [])

  useEffect(() => {
    const keys = getApiKeys()
    const prefs = getPreferences()
    savePreferences({ ...prefs, defaultLanguage: language })
    const controller = new AbortController()

    runPipeline({
      episode,
      podcast,
      language,
      summaryMin,
      summaryMax,
      openaiKey: keys.openai,
      elevenlabsKey: keys.elevenlabs,
      onProgress: (p: PipelineProgress) => {
        setCurrentStage(p.stage)
        setStageProgress(p.progress)
        setStageDetail(p.detail ?? '')
        setStages((prev) => {
          const next = { ...prev }
          const idx = STAGE_ORDER.indexOf(p.stage)
          STAGE_ORDER.slice(0, idx).forEach((s) => { if (next[s] !== 'done') next[s] = 'done' })
          next[p.stage] = p.progress === 1 ? 'done' : 'active'
          return next
        })
      },
      signal: controller.signal,
    })
      .then(onDone)
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setErrorMsg(String(e.message || e))
      })

    return () => controller.abort()
  }, [])

  return (
    <div className="flex flex-col px-5 gap-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}>
      <div>
        <h1 className="text-xl font-bold text-white">Processing</h1>
        <p className="text-sm text-zinc-500 mt-1 line-clamp-1">{podcast.collectionName} — {episode.title}</p>
      </div>

      <div className="flex flex-col gap-4">
        {STAGE_ORDER.map((stage) => (
          <StageRow
            key={stage}
            label={STAGE_LABELS[stage]}
            status={stages[stage]}
            progress={stage === currentStage ? stageProgress : stages[stage] === 'done' ? 1 : 0}
            detail={stage === currentStage ? stageDetail : undefined}
          />
        ))}
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-red-400 text-sm font-semibold">Error</p>
          <p className="text-red-300 text-xs font-mono break-all whitespace-pre-wrap">{errorMsg}</p>
          <button onClick={onBack} className="text-brand text-sm text-left">← Back to setup</button>
        </div>
      )}
    </div>
  )
}

function StageRow({ label, status, progress, detail }: { label: string; status: string; progress: number; detail?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className={`text-sm ${status === 'active' ? 'text-white' : status === 'done' ? 'text-zinc-500' : 'text-zinc-700'}`}>
            {label}
          </span>
          {detail && status === 'active' && (
            <span className="block text-xs text-zinc-600 truncate">{detail}</span>
          )}
        </div>
        <span className="text-xs font-mono text-zinc-600 flex-shrink-0">
          {status === 'done' ? '✓' : status === 'active' ? `${Math.round(progress * 100)}%` : ''}
        </span>
      </div>
      <div className="h-0.5 bg-white/6 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            status === 'done' ? 'bg-green-500' : status === 'active' ? 'bg-brand' : 'bg-transparent'
          }`}
          style={{ width: `${status === 'done' ? 100 : Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Player ──────────────────────────────────────────────────────────────────

const SPEEDS = [0.8, 1, 1.25, 1.5, 2]

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function PlayerScreen({
  episode, podcast, processed,
}: {
  episode: Episode; podcast: ItunesResult; processed: ProcessedEpisode
}) {
  const engineRef = useRef<AudioEngine | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [activeSummaryIdx, setActiveSummaryIdx] = useState<number | null>(null)
  const [summaryOverlay, setSummaryOverlay] = useState<{ text: string } | null>(null)
  const [nextSummaryIn, setNextSummaryIn] = useState<number | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const currentTimeRef = useRef(0)
  const posKey = `polycast:pos:${processed.guid}`

  useEffect(() => {
    const initialPosition = Number(localStorage.getItem(posKey) ?? 0)
    const meta: AudioEngineMeta = {
      title: episode.title,
      artist: podcast.collectionName,
      artwork: podcast.artworkUrl100,
    }
    const engine = new AudioEngine(processed, meta, {
      onTimeUpdate: (t) => {
        setCurrentTime(t)
        currentTimeRef.current = t
        // Save position every ~10 seconds
        if (Math.floor(t / 10) > Math.floor(currentTimeRef.current / 10) || t === 0) {
          localStorage.setItem(posKey, String(Math.floor(t)))
        }
        const upcoming = processed.summaries.find((s) => s.timestamp > t)
        setNextSummaryIn(upcoming ? upcoming.timestamp - t : null)
        const lastPast = [...processed.summaries].reverse().find((s) => s.timestamp <= t)
        setActiveSummaryIdx(lastPast ? processed.summaries.indexOf(lastPast) : null)
      },
      onDurationChange: setDuration,
      onSummaryStart: (idx) => {
        setSummaryOverlay({ text: processed.summaries[idx].text })
        setActiveSummaryIdx(idx)
      },
      onSummaryEnd: () => setSummaryOverlay(null),
      onPlayStateChange: setPlaying,
    }, initialPosition)
    engineRef.current = engine
    return () => {
      localStorage.setItem(posKey, String(Math.floor(currentTimeRef.current)))
      engine.destroy()
    }
  }, [processed])

  const controls = {
    playing,
    currentTime,
    duration,
    speed,
    onTogglePlay: () => engineRef.current?.togglePlay(),
    onSeek: (t: number) => engineRef.current?.seek(t),
    onSkip: (d: number) => engineRef.current?.skip(d),
    onSetSpeed: (s: number) => { setSpeed(s); engineRef.current?.setSpeed(s) },
  }

  if (showTranscript && processed.transcriptLines?.length) {
    return (
      <>
        <TranscriptView
          lines={processed.transcriptLines}
          controls={controls}
          onClose={() => setShowTranscript(false)}
        />
        {summaryOverlay && <SummaryOverlay text={summaryOverlay.text} />}
      </>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="relative">
        <img
          src={podcast.artworkUrl600 || podcast.artworkUrl100}
          alt={podcast.collectionName}
          className="w-full aspect-square object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#13101f] via-[#13101f]/20" />
      </div>

      <div className="flex-1 flex flex-col px-5 py-6 gap-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500">{podcast.collectionName}</p>
            <h1 className="text-base font-semibold text-white mt-1 line-clamp-2 leading-snug">{episode.title}</h1>
            {processed.titleTranslation && (
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1 italic">{processed.titleTranslation}</p>
            )}
          </div>
          {processed.transcriptLines?.length ? (
            <button
              onClick={() => setShowTranscript(true)}
              className="flex-shrink-0 flex items-center gap-1.5 bg-white/8 hover:bg-white/12 text-zinc-300 hover:text-white rounded-full px-3 py-1.5 transition-all text-xs font-medium"
            >
              <TranscriptIcon />
              Transcript
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <input type="range" min={0} max={duration || 1} value={currentTime}
            onChange={(e) => engineRef.current?.seek(Number(e.target.value))}
            className="w-full h-1 accent-brand rounded-full" />
          <div className="flex justify-between text-xs font-mono text-zinc-500">
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Summaries</p>
            {nextSummaryIn !== null && (
              <p className="text-xs font-mono text-brand">Next in {fmt(nextSummaryIn)}</p>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {processed.summaries.map((s, i) => (
              <button key={i} onClick={() => engineRef.current?.seek(s.timestamp)}
                title={`${fmt(s.timestamp)}: ${s.text.slice(0, 60)}…`}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === activeSummaryIdx ? 'bg-brand scale-125'
                    : currentTime > s.timestamp ? 'bg-brand/30' : 'bg-white/15'
                }`} />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-8">
          <button onClick={() => engineRef.current?.skip(-15)} className="text-zinc-400 hover:text-white transition-colors"><SkipBackIcon /></button>
          <button onClick={() => engineRef.current?.togglePlay()}
            className="w-16 h-16 rounded-full bg-brand flex items-center justify-center text-black shadow-lg active:scale-95 transition-transform">
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button onClick={() => engineRef.current?.skip(15)} className="text-zinc-400 hover:text-white transition-colors"><SkipFwdIcon /></button>
        </div>

        <div className="flex justify-center gap-2">
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => { setSpeed(s); engineRef.current?.setSpeed(s) }}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                speed === s ? 'bg-brand/20 text-brand' : 'text-zinc-600 hover:text-zinc-400'
              }`}>{s}×</button>
          ))}
        </div>
      </div>

      {summaryOverlay && <SummaryOverlay text={summaryOverlay.text} />}
    </div>
  )
}

// ─── Transcript View ──────────────────────────────────────────────────────────

interface PlayerControls {
  playing: boolean
  currentTime: number
  duration: number
  speed: number
  onTogglePlay: () => void
  onSeek: (t: number) => void
  onSkip: (d: number) => void
  onSetSpeed: (s: number) => void
}

function TranscriptView({ lines, controls, onClose }: {
  lines: TranscriptLine[]
  controls: PlayerControls
  onClose: () => void
}) {
  const { playing, currentTime, duration, speed, onTogglePlay, onSeek, onSkip, onSetSpeed } = controls
  const containerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const autoScrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Keep screen on while transcript is visible
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const acquire = () => {
      (navigator.wakeLock as WakeLock).request('screen').then((l) => { lock = l }).catch(() => {})
    }
    acquire()
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release()
    }
  }, [])

  const activeIdx = lines.reduce((best, line, i) => line.start <= currentTime ? i : best, -1)

  useEffect(() => {
    if (!autoScroll || activeIdx < 0) return
    lineRefs.current[activeIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIdx, autoScroll])

  function handleScroll() {
    setAutoScroll(false)
    clearTimeout(autoScrollTimer.current)
    autoScrollTimer.current = setTimeout(() => setAutoScroll(true), 3000)
  }

  return (
    <div className="flex flex-col h-full bg-[#13101f]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Transcript</p>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Scrolling lines */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5"
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="pt-[35vh] pb-[45vh]">
          {lines.map((line, i) => {
            const dist = Math.abs(i - activeIdx)
            const isActive = i === activeIdx
            const originalOpacity = isActive ? 1 : Math.max(0.25, 1 - dist * 0.18)
            const translationOpacity = isActive ? 0.7 : Math.max(0.35, 0.7 - dist * 0.1)
            return (
              <button
                key={i}
                ref={(el) => { lineRefs.current[i] = el }}
                onClick={() => { onSeek(line.start); setAutoScroll(true) }}
                className="block w-full text-left py-2.5"
              >
                <p
                  className={`text-lg font-medium leading-snug transition-all ${
                    isActive ? 'text-brand' : 'text-white'
                  }`}
                  style={{ opacity: originalOpacity }}
                >
                  {line.original}
                </p>
                {line.translation ? (
                  <p
                    className="text-sm text-zinc-400 mt-0.5 leading-snug transition-all"
                    style={{ opacity: translationOpacity }}
                  >
                    {line.translation}
                  </p>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* Compact controls */}
      <div className="flex-shrink-0 px-5 pt-3 pb-8 bg-gradient-to-t from-[#13101f] to-transparent">
        <input type="range" min={0} max={duration || 1} value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-1 accent-brand rounded-full" />
        <div className="flex justify-between text-xs font-mono text-zinc-600 mt-1 mb-4">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
        <div className="flex items-center justify-center gap-8 mb-4">
          <button onClick={() => onSkip(-15)} className="text-zinc-400"><SkipBackIcon /></button>
          <button onClick={onTogglePlay}
            className="w-14 h-14 rounded-full bg-brand flex items-center justify-center text-black active:scale-95 transition-transform">
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button onClick={() => onSkip(15)} className="text-zinc-400"><SkipFwdIcon /></button>
        </div>
        <div className="flex justify-center gap-2">
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => onSetSpeed(s)}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                speed === s ? 'bg-brand/20 text-brand' : 'text-zinc-600 hover:text-zinc-400'
              }`}>{s}×</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SummaryOverlay({ text }: { text: string }) {
  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-end z-40"
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-[480px] mx-auto bg-[#242138] rounded-t-3xl p-6 pb-10 max-h-[70vh] flex flex-col">
        <div className="flex items-center gap-2 mb-4 flex-shrink-0">
          <span className="bg-brand text-black text-xs font-bold px-2.5 py-1 rounded-full">Summary</span>
          <div className="flex gap-0.5 items-end h-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-0.5 bg-brand rounded-full animate-pulse"
                style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        </div>
        <div
          className="text-white text-base leading-relaxed overflow-y-auto flex-1 min-h-0"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {text}
        </div>
      </div>
    </div>
  )
}

function TranscriptIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="w-7 h-7 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}

function SkipBackIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 0 0 0 1.6l5.334 4A1 1 0 0 0 19 16V8a1 1 0 0 0-1.6-.8l-5.333 4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.066 11.2a1 1 0 0 0 0 1.6l5.334 4A1 1 0 0 0 11 16V8a1 1 0 0 0-1.6-.8l-5.334 4z" />
    </svg>
  )
}

function SkipFwdIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.933 12.8a1 1 0 0 0 0-1.6L6.6 7.2A1 1 0 0 0 5 8v8a1 1 0 0 0 1.6.8l5.333-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.933 12.8a1 1 0 0 0 0-1.6l-5.333-4A1 1 0 0 0 13 8v8a1 1 0 0 0 1.6.8l5.333-4z" />
    </svg>
  )
}
