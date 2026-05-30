import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { getAllCachedEpisodes, deleteCachedEpisode, type ProcessedEpisode } from '../lib/storage'
import { setEpisodeNav } from '../lib/nav-state'
import { useDownloadMap, cancelDownload, type DownloadEntry } from '../lib/download-queue'
import type { Episode } from '../lib/rss'
import type { ItunesResult } from '../lib/itunes'

export const Route = createFileRoute('/episodes')({
  component: EpisodesScreen,
})

function EpisodesScreen() {
  const [cachedEps, setCachedEps] = useState<ProcessedEpisode[]>([])
  const navigate = useNavigate()
  const downloads = useDownloadMap()

  function loadCached() {
    getAllCachedEpisodes().then((all) =>
      setCachedEps(all.sort((a, b) => (b.episodePubDate ?? '').localeCompare(a.episodePubDate ?? '')))
    )
  }

  useEffect(() => { loadCached() }, [])

  // Refresh IDB list whenever the download queue changes (e.g. a download completes)
  useEffect(() => {
    window.addEventListener('polycast:downloads', loadCached)
    return () => window.removeEventListener('polycast:downloads', loadCached)
  }, [])

  async function handleDelete(guid: string) {
    await deleteCachedEpisode(guid)
    setCachedEps((prev) => prev.filter((e) => e.guid !== guid))
  }

  function handlePlay(ep: ProcessedEpisode) {
    const episode: Episode = {
      guid: ep.guid,
      title: ep.episodeTitle ?? ep.guid,
      pubDate: ep.episodePubDate ?? '',
      duration: ep.episodeDuration ?? '',
      enclosureUrl: ep.enclosureUrl,
    }
    const podcast: ItunesResult = {
      collectionId: Number(ep.podcastId ?? 0),
      collectionName: ep.podcastName ?? '',
      artistName: '',
      artworkUrl100: ep.podcastArtwork ?? '',
      artworkUrl600: ep.podcastArtwork ?? '',
      feedUrl: '',
    }
    const navId = encodeURIComponent(ep.guid)
    setEpisodeNav(navId, { episode, podcast })
    navigate({ to: '/episode/$id', params: { id: navId } })
  }

  const activeDownloads = [...downloads.values()].filter((d) => d.status === 'processing' || d.status === 'error')
  const isEmpty = cachedEps.length === 0 && activeDownloads.length === 0

  return (
    <div className="flex flex-col">
      <header className="px-5 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <h1 className="text-2xl font-bold text-white tracking-tight">Episodes</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Your downloaded episodes</p>
      </header>

      {/* Active downloads */}
      {activeDownloads.length > 0 && (
        <div className="px-5 mb-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Downloading</p>
          <div className="flex flex-col gap-2">
            {activeDownloads.map((d) => (
              <ActiveDownloadRow key={d.guid} entry={d} />
            ))}
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center h-64 text-center px-8">
          <div className="text-4xl mb-4">⬇️</div>
          <p className="text-zinc-400 text-sm">No episodes downloaded yet.</p>
          <p className="text-zinc-600 text-sm mt-1">Tap the download icon next to any episode to process it.</p>
        </div>
      )}

      {cachedEps.length > 0 && (
        <div className="px-5">
          {activeDownloads.length > 0 && (
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3 mt-4">Ready</p>
          )}
          <div className="flex flex-col gap-0.5">
            {cachedEps.map((ep) => (
              <CachedEpisodeRow
                key={ep.guid}
                ep={ep}
                onPlay={() => handlePlay(ep)}
                onDelete={() => handleDelete(ep.guid)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActiveDownloadRow({ entry }: { entry: DownloadEntry }) {
  const circumference = 2 * Math.PI * 9
  const offset = circumference * (1 - entry.progress)

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/6">
      <img
        src={entry.podcastArtwork}
        alt={entry.podcastName}
        className="w-10 h-10 rounded-lg object-cover flex-shrink-0 opacity-70"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white line-clamp-1">{entry.episodeTitle}</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {entry.status === 'error'
            ? <span className="text-red-400">{entry.error ?? 'Processing failed'}</span>
            : entry.stage
              ? STAGE_LABELS[entry.stage]
              : 'Starting…'}
        </p>
      </div>
      {entry.status === 'processing' ? (
        <svg className="w-6 h-6 flex-shrink-0 -rotate-90" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" className="text-white/10" fill="none" />
          <circle
            cx="12" cy="12" r="9"
            stroke="currentColor" strokeWidth="2" className="text-amber-400"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <button
          onClick={() => cancelDownload(entry.guid)}
          className="flex-shrink-0 text-zinc-600 hover:text-zinc-400 p-1"
        >
          <XIcon />
        </button>
      )}
    </div>
  )
}

function CachedEpisodeRow({
  ep, onPlay, onDelete,
}: {
  ep: ProcessedEpisode
  onPlay: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/6">
      <button onClick={onPlay} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <img
          src={ep.podcastArtwork ?? ''}
          alt={ep.podcastName ?? ''}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white line-clamp-2 leading-snug">
            {ep.episodeTitle ?? ep.guid}
          </p>
          <div className="flex gap-2 text-xs text-zinc-500 mt-0.5">
            <span className="truncate max-w-[120px]">{ep.podcastName}</span>
            {ep.episodeDuration && <span>{ep.episodeDuration}</span>}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onPlay}
          className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center text-black shadow"
        >
          <PlayIcon />
        </button>
        <button
          onClick={onDelete}
          className="w-9 h-9 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

const STAGE_LABELS: Record<string, string> = {
  download: 'Downloading…',
  transcribe: 'Transcribing…',
  translate: 'Translating…',
  summarize: 'Summarising…',
  tts: 'Generating audio…',
  build: 'Finishing up…',
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
