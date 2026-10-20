/**
 * Mia matches the show's volume (PC-1017-F16). Preparation measures the episode's loudness (LUFS)
 * on the server's own copy; the guide's lines are rendered at the podcast standard, and on the phone
 * they're played at a level matched to the episode, so the guide never booms over a quiet show.
 */

/** The podcast loudness standard the guide's lines are rendered at. */
export const GUIDE_LUFS = -16

/** Loudness outside this range is a failed measurement (silence, a broken file), not a real show. */
const PLAUSIBLE_LUFS: [number, number] = [-60, 0]

/** The guide is never turned down below this, so it stays audible on the quietest show. */
export const MIN_GUIDE_VOLUME = 0.1

/** The integrated loudness from ffmpeg's ebur128 summary ("I: -21.8 LUFS"), or undefined. */
export function parseIntegratedLoudness(ffmpegLog: string): number | undefined {
  const summary = ffmpegLog.lastIndexOf('Summary:')
  const m = (summary >= 0 ? ffmpegLog.slice(summary) : ffmpegLog).match(/\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/)
  const v = m ? Number(m[1]) : NaN
  return Number.isFinite(v) && v >= PLAUSIBLE_LUFS[0] && v <= PLAUSIBLE_LUFS[1] ? v : undefined
}

/**
 * How loud the guide plays (0–1) over an episode measured at `episodeLufs`: matched to the episode,
 * never above full volume (the player can only turn sound down), never below MIN_GUIDE_VOLUME.
 * Unmeasured episodes (older plans) play the guide at full volume, as before.
 */
export function guideVolume(episodeLufs: number | undefined): number {
  if (episodeLufs === undefined || !Number.isFinite(episodeLufs)) return 1
  const gainDb = Math.min(0, episodeLufs - GUIDE_LUFS)
  return Math.max(MIN_GUIDE_VOLUME, Math.min(1, 10 ** (gainDb / 20)))
}
