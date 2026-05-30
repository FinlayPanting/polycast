import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { searchPodcasts, type ItunesResult } from '../lib/itunes'
import { getFollowing, type FollowedPodcast } from '../lib/storage'
import { setPodcastNav } from '../lib/nav-state'

export const Route = createFileRoute('/')({
  component: HomeScreen,
})

function HomeScreen() {
  const [tab, setTab] = useState<'following' | 'search'>('following')

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 pt-12 pb-4">
        <h1 className="text-2xl font-bold text-white tracking-tight">Polycast</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Deep immersion without losing the thread</p>
      </header>

      <div className="flex border-b border-white/8 px-5">
        <TabBtn active={tab === 'following'} onClick={() => setTab('following')}>Following</TabBtn>
        <TabBtn active={tab === 'search'} onClick={() => setTab('search')}>Search</TabBtn>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'following' ? <FollowingTab /> : <SearchTab />}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-brand text-brand'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

function FollowingTab() {
  const [followed, setFollowed] = useState<FollowedPodcast[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    setFollowed(getFollowing())
  }, [])

  if (followed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-8">
        <div className="text-4xl mb-4">🎧</div>
        <p className="text-zinc-400 text-sm">No podcasts followed yet.</p>
        <p className="text-zinc-600 text-sm mt-1">Search for a podcast to get started.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3 p-5">
      {followed.map((p) => (
        <button
          key={p.id}
          onClick={() => navigate({ to: '/podcast/$id', params: { id: p.id } })}
          className="flex flex-col items-center gap-2 group"
        >
          <img
            src={p.artwork}
            alt={p.title}
            className="w-full aspect-square rounded-xl object-cover shadow-lg group-hover:ring-2 ring-brand transition-all"
          />
          <span className="text-xs text-zinc-400 text-center line-clamp-2 leading-tight">{p.title}</span>
        </button>
      ))}
    </div>
  )
}

function SearchTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ItunesResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const search = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const data = await searchPodcasts(query)
      setResults(data)
    } catch (e) {
      setError('Search failed. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [query])

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex gap-2">
        <input
          type="search"
          placeholder="Search podcasts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          className="flex-1 bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-brand/50 transition-colors"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-4 py-3 bg-brand text-black text-sm font-semibold rounded-xl disabled:opacity-50 transition-opacity"
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex flex-col gap-2">
        {results.map((r) => (
          <button
            key={r.collectionId}
            onClick={() => {
              setPodcastNav(String(r.collectionId), r)
              navigate({ to: '/podcast/$id', params: { id: String(r.collectionId) } })
            }}
            className="flex items-center gap-3 p-3 rounded-xl bg-white/4 hover:bg-white/8 transition-colors text-left"
          >
            <img src={r.artworkUrl100} alt={r.collectionName} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{r.collectionName}</p>
              <p className="text-xs text-zinc-500 truncate">{r.artistName}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
