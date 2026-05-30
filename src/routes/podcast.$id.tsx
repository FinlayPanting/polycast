import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { fetchFeed, type Episode } from '../lib/rss'
import { getFollowing, followPodcast, unfollowPodcast, getAllCachedGuids, getPreferences } from '../lib/storage'
import { fetchPodcastById, type ItunesResult } from '../lib/itunes'
import { setEpisodeNav, getPodcastNav, setPodcastNav } from '../lib/nav-state'
import { useDownloadMap, startDownload, type DownloadEntry } from '../lib/download-queue'

export const Route = createFileRoute('/podcast/$id')({
  component: PodcastScreen,
})

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

interface DownloadSheetTarget {
  episode: Episode
  podcast: ItunesResult
}

function PodcastScreen() {
  const { id } = Route.useParams()
  const navigate = useNavigate()

  const [podcast, setPodcast] = useState<ItunesResult | null>(() => getPodcastNav(id))
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [episodesLoading, setEpisodesLoading] = useState(true)
  const [episodesError, setEpisodesError] = useState<string | null>(null)
  const [followed, setFollowed] = useState(() => getFollowing().some((p) => p.id === id))
  const [cachedGuids, setCachedGuids] = useState<Set<string>>(new Set())
  const [downloadSheet, setDownloadSheet] = useState<DownloadSheetTarget | null>(null)
  const downloads = useDownloadMap()

  function loadCachedGuids() {
    getAllCachedGuids().then(setCachedGuids)
  }

  useEffect(() => { loadCachedGuids() }, [])

  // Refresh cached guids when a download completes
  useEffect(() => {
    window.addEventListener('polycast:downloads', loadCachedGuids)
    return () => window.removeEventListener('polycast:downloads', loadCachedGuids)
  }, [])

  useEffect(() => {
    if (podcast) return
    fetchPodcastById(id)
      .then((result) => {
        if (result) { setPodcast(result); setPodcastNav(id, result) }
      })
      .catch(() => {})
  }, [id])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setEpisodesLoading(true)
    setEpisodesError(null)

    async function loadEpisodes() {
      let feedUrl = podcast?.feedUrl
      if (!feedUrl) {
        const result = await fetchPodcastById(id)
        if (result) { setPodcast(result); setPodcastNav(id, result); feedUrl = result.feedUrl }
      }
      if (!feedUrl) throw new Error('No feed URL found for this podcast.')
      const eps = await fetchFeed(feedUrl, signal)
      setEpisodes(eps)
    }

    loadEpisodes()
      .catch((e) => { if (!signal.aborted) setEpisodesError(String(e.message || e)) })
      .finally(() => { if (!signal.aborted) setEpisodesLoading(false) })

    return () => controller.abort()
  }, [id, podcast?.feedUrl])

  function toggleFollow() {
    if (!podcast) return
    if (followed) {
      unfollowPodcast(id); setFollowed(false)
    } else {
      followPodcast({
        id,
        title: podcast.collectionName,
        author: podcast.artistName,
        artwork: podcast.artworkUrl600 || podcast.artworkUrl100,
        feedUrl: podcast.feedUrl || '',
      })
      setFollowed(true)
    }
  }

  if (!podcast) {
    return <div className="flex items-center justify-center h-64"><Spinner /></div>
  }

  return (
    <div className="flex flex-col">
      {/* Artwork header */}
      <div className="relative">
        <button
          onClick={() => navigate({ to: '/' })}
          className="absolute left-4 z-10 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
        >
          <BackIcon />
        </button>
        <img
          src={podcast.artworkUrl600 || podcast.artworkUrl100}
          alt={podcast.collectionName}
          className="w-full aspect-square object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#13101f] via-transparent" />
      </div>

      <div className="px-5 -mt-16 relative z-10">
        <h1 className="text-xl font-bold text-white leading-tight">{podcast.collectionName}</h1>
        <p className="text-sm text-zinc-400 mt-1">{podcast.artistName}</p>
        <button
          onClick={toggleFollow}
          className={`mt-3 px-5 py-2 rounded-full text-sm font-semibold border transition-all ${
            followed ? 'bg-transparent border-zinc-600 text-zinc-400' : 'bg-brand border-brand text-black'
          }`}
        >
          {followed ? 'Following' : 'Follow'}
        </button>
      </div>

      <div className="mt-6 px-5">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Episodes</h2>

        {episodesLoading && (
          <div className="flex items-center gap-2 py-4 text-zinc-600 text-sm">
            <Spinner small /> Loading episodes…
          </div>
        )}

        {episodesError && !episodesLoading && (
          <p className="text-red-400 text-sm py-4">{episodesError}</p>
        )}

        <div className="flex flex-col gap-0.5">
          {episodes.map((ep) => {
            const isCached = cachedGuids.has(ep.guid)
            const dlEntry = downloads.get(ep.guid)
            return (
              <EpisodeRow
                key={ep.guid}
                episode={ep}
                isCached={isCached}
                dlEntry={dlEntry}
                onNavigate={() => {
                  const navId = encodeURIComponent(ep.guid)
                  setEpisodeNav(navId, { episode: ep, podcast: podcast! })
                  navigate({ to: '/episode/$id', params: { id: navId } })
                }}
                onDownload={() => setDownloadSheet({ episode: ep, podcast: podcast! })}
              />
            )
          })}
        </div>
      </div>

      {downloadSheet && (
        <DownloadOptionsSheet
          target={downloadSheet}
          onClose={() => setDownloadSheet(null)}
        />
      )}
    </div>
  )
}

function EpisodeRow({
  episode, isCached, dlEntry, onNavigate, onDownload,
}: {
  episode: Episode
  isCached: boolean
  dlEntry: DownloadEntry | undefined
  onNavigate: () => void
  onDownload: () => void
}) {
  const isReady = isCached || dlEntry?.status === 'done'
  const isProcessing = dlEntry?.status === 'processing'
  const isError = dlEntry?.status === 'error'

  return (
    <div className="flex items-center gap-2 py-4 border-b border-white/6 -mx-2 px-2 hover:bg-white/3 transition-colors rounded-lg">
      {/* Tappable title area */}
      <button onClick={onNavigate} className="flex-1 min-w-0 text-left">
        <p className="text-sm text-white font-medium line-clamp-2 leading-snug">{episode.title}</p>
        <div className="flex gap-3 text-xs text-zinc-500 mt-1">
          <span>{episode.pubDate}</span>
          {episode.duration && <span>{episode.duration}</span>}
        </div>
      </button>

      {/* Download status button */}
      {isReady ? (
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-green-500">
          <CheckIcon />
        </div>
      ) : isProcessing ? (
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
          <ProgressRing progress={dlEntry!.progress} />
        </div>
      ) : isError ? (
        <button
          onClick={(e) => { e.stopPropagation(); onDownload() }}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-red-400 active:scale-90 transition-transform"
          title="Retry download"
        >
          <RetryIcon />
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onDownload() }}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-brand active:scale-90 transition-all"
          title="Download episode"
        >
          <DownloadIcon />
        </button>
      )}
    </div>
  )
}

function ProgressRing({ progress }: { progress: number }) {
  const r = 9
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - progress)
  return (
    <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r={r} stroke="currentColor" strokeWidth="2" className="text-white/10" fill="none" />
      <circle
        cx="12" cy="12" r={r}
        stroke="currentColor" strokeWidth="2" className="text-amber-400"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}

function DownloadOptionsSheet({
  target, onClose,
}: {
  target: DownloadSheetTarget
  onClose: () => void
}) {
  const prefs = getPreferences()
  const [language, setLanguage] = useState(prefs.defaultLanguage)
  const [summaryMin, setSummaryMin] = useState(prefs.summaryMin)
  const [summaryMax, setSummaryMax] = useState(prefs.summaryMax)

  function handleStart() {
    startDownload(target.episode, target.podcast, language, summaryMin, summaryMax)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] mx-auto bg-[#1c1930] rounded-t-3xl p-6 pb-10 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div>
          <p className="text-xs text-zinc-500 mb-0.5">{target.podcast.collectionName}</p>
          <h2 className="text-base font-semibold text-white leading-snug line-clamp-2">{target.episode.title}</h2>
        </div>

        {/* Language */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Language</p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                  language === l
                    ? 'bg-amber-400/15 border-amber-400 text-amber-400'
                    : 'bg-white/4 border-white/10 text-zinc-400'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Summary frequency */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Summary frequency</p>
          <div className="flex gap-2 flex-wrap">
            {MIN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSummaryMin(opt.value)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                  summaryMin === opt.value
                    ? 'bg-amber-400/15 border-amber-400 text-amber-400'
                    : 'bg-white/4 border-white/10 text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <span className="text-zinc-600 self-center text-sm">to</span>
            {MAX_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSummaryMax(opt.value)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                  summaryMax === opt.value
                    ? 'bg-amber-400/15 border-amber-400 text-amber-400'
                    : 'bg-white/4 border-white/10 text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-600">Summaries play at natural pauses within this range.</p>
        </div>

        <button
          onClick={handleStart}
          className="w-full py-3.5 bg-amber-400 text-black font-semibold rounded-xl transition-all active:scale-[0.98]"
        >
          Download &amp; Process
        </button>
      </div>
    </div>
  )
}

function Spinner({ small }: { small?: boolean }) {
  const size = small ? 'w-4 h-4' : 'w-8 h-8'
  return (
    <svg className={`${size} animate-spin text-brand`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17h16" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function RetryIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}
