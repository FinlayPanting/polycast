import { clipAudio } from './episodeAudio'
import { newReview, nextReview, normalizeToken, type Clip, type ReviewState, type SavedWord } from '@polycast/core'
import { config } from './config'
import { supabase } from './supabase'
import { DEMO_WORDS } from '../demo/session'

interface Row {
  language: string
  lemma: string
  forms: string[]
  meaning: string
  episode_id: string | null
  clip: Clip
  sentence: string
  review: ReviewState
  created_at: string
}

const toSaved = (r: Row): SavedWord => ({
  lemma: r.lemma,
  forms: r.forms,
  meaning: r.meaning,
  language: r.language,
  source: { episodeId: r.episode_id ?? '', clip: r.clip, sentence: r.sentence },
  review: r.review,
})

/** Saves a word with the host's clip it came from. Saving it again from another episode adds the new form. */
export async function saveWord(
  userId: string,
  w: { lemma: string; form: string; meaning: string; language: string; episodeId: string; clip: Clip; sentence: string },
): Promise<void> {
  if (config.demo) return
  const lemma = normalizeToken(w.lemma, w.language) || w.lemma
  const form = normalizeToken(w.form, w.language)
  const { data: existing } = await supabase.from('saved_words').select('forms').eq('user_id', userId).eq('language', w.language).eq('lemma', lemma).maybeSingle()
  if (existing) {
    const forms = Array.from(new Set([...(existing.forms as string[]), form]))
    await supabase.from('saved_words').update({ forms }).eq('user_id', userId).eq('language', w.language).eq('lemma', lemma)
    return
  }
  const { error } = await supabase.from('saved_words').insert({
    user_id: userId,
    language: w.language,
    lemma,
    forms: [form],
    meaning: w.meaning,
    episode_id: w.episodeId,
    clip: w.clip,
    sentence: w.sentence,
    review: newReview(new Date().toISOString()),
  })
  if (error) throw new Error('Couldn’t save that word. Check your connection and try again.')
}

/** A saved word with where its clip plays from; `clipGone` when its episode copy has left the phone. */
export type WordWithClip = SavedWord & { audioUrl?: string; clipGone?: boolean }

export async function listWords(language: string): Promise<WordWithClip[]> {
  if (config.demo) return DEMO_WORDS
  const { data } = await supabase
    .from('saved_words')
    .select('language, lemma, forms, meaning, episode_id, clip, sentence, review, created_at, episodes(audio_url)')
    .eq('language', language)
    .order('created_at', { ascending: false })
  return ((data ?? []) as unknown as (Row & { episodes: { audio_url: string } | null })[]).map((r) => {
    const saved = toSaved(r)
    const audioUrl = r.episodes?.audio_url ? clipAudio(saved.source.episodeId, r.episodes.audio_url) : undefined
    return { ...saved, audioUrl, clipGone: Boolean(r.episodes?.audio_url) && !audioUrl }
  })
}

export async function recordReview(userId: string, word: SavedWord, result: 'gotIt' | 'again'): Promise<void> {
  if (config.demo) return
  const review = nextReview(word.review, result, new Date().toISOString())
  await supabase.from('saved_words').update({ review }).eq('user_id', userId).eq('language', word.language).eq('lemma', word.lemma)
}

/** Episodes the learner's saved words come from: their downloads are kept when tidying. */
export async function savedWordEpisodes(): Promise<Set<string>> {
  if (config.demo) return new Set()
  const { data, error } = await supabase.from('saved_words').select('episode_id')
  if (error) throw error
  return new Set(((data ?? []) as { episode_id: string | null }[]).flatMap((r) => (r.episode_id ? [r.episode_id] : [])))
}
