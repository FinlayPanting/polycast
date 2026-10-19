/**
 * The listen as something that outlives the player screen (PC-1017-F04, PC-1017-F02): it keeps
 * playing when the full player is swiped away, shows in the mini-player above the tabs, and the last
 * episode is waiting there, paused, when the app is opened again. Pure rules, so they can be tested.
 */

export interface ListenParams {
  id: string
  /** '0' for subtitles only. */
  guide?: string
  level?: 'light' | 'standard' | 'handsOn'
  /** Start here (a jump from the episode map), instead of where the learner left off. */
  from?: number
}

/** Two opens with the same key are the same listen: re-opening the player re-attaches to it. */
export const sessionKey = (p: ListenParams) => `${p.id}|${p.guide === '0' ? 'subtitles' : 'guided'}|${p.level ?? ''}`

/**
 * What opening the player does, given what's already loaded: carry on with the listen in progress
 * (just show it), move it to a new starting point, or start a fresh one.
 */
export function openDecision(currentKey: string | undefined, next: ListenParams, currentFailed = false): 'reuse' | 'seek' | 'restart' {
  if (!currentKey || currentFailed || currentKey !== sessionKey(next)) return 'restart'
  return next.from !== undefined ? 'seek' : 'reuse'
}

/** A `from` screen parameter as a number of seconds, if it is one. */
export function fromParam(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : undefined
}

/** Kept on the phone so the mini-player can offer it after the app has been closed. */
export interface LastPlayed {
  id: string
  title: string
  podcastTitle: string
  image: string | null
  durationSec: number
  guide?: string
  level?: ListenParams['level']
}

export const LAST_PLAYED_KEY = 'polycast.lastPlayed.v1'

export function parseLastPlayed(raw: string | null | undefined): LastPlayed | undefined {
  if (!raw) return undefined
  try {
    const v = JSON.parse(raw)
    if (typeof v?.id !== 'string' || typeof v.title !== 'string' || typeof v.podcastTitle !== 'string') return undefined
    const durationSec = typeof v.durationSec === 'number' && v.durationSec > 0 ? v.durationSec : 0
    const level = ['light', 'standard', 'handsOn'].includes(v.level) ? v.level : undefined
    return { id: v.id, title: v.title, podcastTitle: v.podcastTitle, image: typeof v.image === 'string' ? v.image : null, durationSec, guide: v.guide === '0' ? '0' : undefined, level }
  } catch {
    return undefined
  }
}

export type MiniPlayerView =
  | { kind: 'hidden' }
  | { kind: 'live'; id: string; title: string; podcastTitle: string; image: string | null; playing: boolean; loading: boolean; finished: boolean; progress: number }
  | { kind: 'resume'; id: string; title: string; podcastTitle: string; image: string | null; progress: number }

export interface LiveListen {
  id: string
  title?: string
  podcastTitle?: string
  image?: string | null
  durationSec?: number
  phase: 'loading' | 'playing' | 'guide' | 'question' | 'paused' | 'finished' | string
  position: number
  failed: boolean
}

const fraction = (position: number, duration: number | undefined) => (duration && duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0)

/**
 * What the mini-player shows: the listen in progress (playing, paused or still loading), else the
 * last episode, paused where it was left, so one tap carries on. Nothing once that episode is done.
 */
export function miniPlayerView(live: LiveListen | undefined, last: LastPlayed | undefined, lastPosition: number | undefined): MiniPlayerView {
  if (live && !live.failed) {
    const guideOn = live.phase === 'guide' || live.phase === 'question'
    return {
      kind: 'live',
      id: live.id,
      title: live.title ?? last?.title ?? '',
      podcastTitle: live.podcastTitle ?? last?.podcastTitle ?? '',
      image: live.image ?? last?.image ?? null,
      playing: live.phase === 'playing' || guideOn,
      loading: live.phase === 'loading',
      finished: live.phase === 'finished',
      progress: fraction(live.position, live.durationSec ?? last?.durationSec),
    }
  }
  if (!last) return { kind: 'hidden' }
  return { kind: 'resume', id: last.id, title: last.title, podcastTitle: last.podcastTitle, image: last.image, progress: fraction(lastPosition ?? 0, last.durationSec) }
}
