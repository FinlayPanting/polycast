import { newReview, type SavedWord } from '@polycast/core'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '../lib/session'

export const DEMO_SESSION = { user: { id: 'demo-user' }, access_token: 'demo' } as unknown as Session

export const DEMO_PROFILE: Profile = {
  id: 'demo-user',
  signup_rank: 7,
  native_language: 'en',
  target_language: 'sv',
  guidance_level: 'handsOn',
  guide_id: 'mia',
  flag_id: 'se',
  subtitle_mode: 'both',
  plan: 'free',
  free_episode_used: false,
  plus_used_sec: 0,
}

const now = new Date(Date.now() - 2 * 86400_000).toISOString()
const word = (lemma: string, meaning: string, sentence: string, step = 0): SavedWord => ({
  lemma,
  forms: [lemma],
  meaning,
  language: 'sv',
  source: { episodeId: 'ep0', clip: { start: 1, end: 1.5 }, sentence },
  review: { ...newReview(now), step },
})

export const DEMO_WORDS: SavedWord[] = [
  word('försenad', 'delayed, late', 'Tåget var försenat i nästan en timme.'),
  word('mysig', 'cosy', 'Det låter ändå ganska mysigt.'),
  word('ändå', 'still, anyway', 'Det låter ändå ganska mysigt.', 3),
  word('helg', 'weekend', 'Du åkte till Göteborg i helgen.', 2),
]
