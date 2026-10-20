/** The episode's audio: streamed from the publisher, with lock-screen and headphone controls. */
export interface EpisodeAudio {
  load(track: { url: string; title: string; artist: string; artwork?: string; durationSec: number }, startAt?: number): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seek(seconds: number): Promise<void>
  position(): Promise<number>
  setVolume(level: number): Promise<void>
  setRate(rate: number): Promise<void>
  /** Called with the playhead position as it plays (about four times a second). */
  onProgress(listener: (seconds: number) => void): () => void
  onEnded(listener: () => void): () => void
  unload(): Promise<void>
  /** What the lock screen and Control Centre show, without touching playback (PC-1020-08). */
  setNowPlaying?(info: { title: string; artist: string }): Promise<void>
}

/** The guide's voice: short clips played over a paused episode. */
export interface GuideVoice {
  /** Plays a clip to the end, or until `stop` is called. */
  play(url: string): Promise<void>
  stop(): void
}

/** Headphone and lock-screen presses. */
export type RemoteCommand = 'play' | 'pause' | 'next' | 'previous' | { seek: number }
