import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { fetchFeed, type Episode } from '../lib/rss'
import { getFollowing, followPodcast, unfollowPodcast } from '../lib/storage'
import { fetchPodcastById, type ItunesResult } from '../lib/itunes'
import { setEpisodeNav, getPodcastNav, setPodcastNav } from '../lib/nav-state'

export const Route = createFileRoute('/podcast/$id')({
  component: PodcastScreen,
})

function PodcastScreen() {
  const { id } = Route.useParams()
  const navigate = useNavigate()

  // Use nav-state cache for instant header render; fall back to iTunes lookup
  const [podcast, setPodcast] = useState<ItunesResult | null>(() => getPodcastNav(id))
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [episodesLoading, setEpisodesLoading] = useState(true)
  const [episodesError, setEpisodesError] = useState<string | null>(null)
  const [followed, setFollowed] = useState(() => getFollowing().some((p) => p.id === id))

  // If we didn't come from search, fetch podcast metadata first
  useEffect(() => {
    if (podcast) return
    fetchPodcastById(id)
      .then((result) => {
        if (result) {
          setPodcast(result)
          setPodcastNav(id, result)
        }
      })
      .catch(() => {})
  }, [id])

  // Load episodes independently so the header shows immediately
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setEpisodesLoading(true)
    setEpisodesError(null)

    async function loadEpisodes() {
      let feedUrl = podcast?.feedUrl
      if (!feedUrl) {
        const result = await fetchPodcastById(id)
        if (result) {
          setPodcast(result)
          setPodcastNav(id, result)
          feedUrl = result.feedUrl
        }
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
      unfollowPodcast(id)
      setFollowed(false)
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

  // Only block on podcast metadata — header renders as soon as we have it
  if (!podcast) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-24">
      {/* Artwork header */}
      <div className="relative">
        <button
          onClick={() => navigate({ to: '/' })}
          className="absolute top-4 left-4 z-10 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white"
        >
          <BackIcon />
        </button>
        <img
          src={podcast.artworkUrl600 || podcast.artworkUrl100}
          alt={podcast.collectionName}
          className="w-full aspect-square object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0f] via-transparent" />
      </div>

      <div className="px-5 -mt-16 relative z-10">
        <h1 className="text-xl font-bold text-white leading-tight">{podcast.collectionName}</h1>
        <p className="text-sm text-zinc-400 mt-1">{podcast.artistName}</p>
        <button
          onClick={toggleFollow}
          className={`mt-3 px-5 py-2 rounded-full text-sm font-semibold border transition-all ${
            followed
              ? 'bg-transparent border-zinc-600 text-zinc-400'
              : 'bg-amber-400 border-amber-400 text-black'
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
          {episodes.map((ep) => (
            <button
              key={ep.guid}
              onClick={() => {
                const navId = encodeURIComponent(ep.guid)
                setEpisodeNav(navId, { episode: ep, podcast: podcast! })
                navigate({ to: '/episode/$id', params: { id: navId } })
              }}
              className="flex flex-col gap-1 py-4 border-b border-white/6 text-left hover:bg-white/3 transition-colors rounded-lg px-2 -mx-2"
            >
              <p className="text-sm text-white font-medium line-clamp-2 leading-snug">{ep.title}</p>
              <div className="flex gap-3 text-xs text-zinc-500">
                <span>{ep.pubDate}</span>
                {ep.duration && <span>{ep.duration}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}


function Spinner({ small }: { small?: boolean }) {
  const size = small ? 'w-4 h-4' : 'w-8 h-8'
  return (
    <svg className={`${size} animate-spin text-amber-400`} fill="none" viewBox="0 0 24 24">
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
