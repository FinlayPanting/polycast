import { segmentAt, type Segment } from '@polycast/core'

/**
 * The line you're hearing, on the lock screen (PC-1020-08): while an episode plays, the lock
 * screen and Control Centre show the current subtitle line, with its English underneath, instead
 * of only the episode's title. Updated once per line, never more. With subtitles off, or between
 * lines, the episode's own title and show come back.
 */
export interface NowPlaying {
  title: string
  artist: string
}

export type LockScreenMode = 'both' | 'target' | 'none'

export function nowPlayingAt(segments: Segment[], position: number, episode: { title: string; podcastTitle: string }, mode: LockScreenMode): { key: string; info: NowPlaying } {
  const i = mode === 'none' ? -1 : segmentAt(segments, position)
  const seg = i >= 0 ? segments[i] : undefined
  if (!seg || !seg.text.trim()) return { key: 'episode', info: { title: episode.title, artist: episode.podcastTitle } }
  const english = mode === 'both' ? seg.translation?.trim() : undefined
  return { key: `${seg.id}:${mode}`, info: { title: seg.text.trim(), artist: english || episode.podcastTitle } }
}

/** Calls `update` only when what the lock screen should show changes. */
export function lockScreenLine(update: (info: NowPlaying) => void) {
  let last: string | undefined
  return {
    at(segments: Segment[], position: number, episode: { title: string; podcastTitle: string }, mode: LockScreenMode) {
      const { key, info } = nowPlayingAt(segments, position, episode, mode)
      if (key === last) return
      last = key
      update(info)
    },
    reset() {
      last = undefined
    },
  }
}
