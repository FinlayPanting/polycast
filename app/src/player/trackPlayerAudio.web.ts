import { demoAudio } from '../demo/audio'
import type { EpisodeAudio } from './types'

/** On the web (previews only) there's no track player; the demo clock stands in. */
export function trackPlayerAudio(): EpisodeAudio {
  return demoAudio(60)
}
