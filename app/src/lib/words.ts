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

export const SAVE_WORD_FAILED = 'Couldn’t save that word. Check your connection and try again.'

type DbError = { code?: string; message?: string } | null

/** The few calls saving a word needs, so the rules below can be tested without Supabase. */
export interface WordStore {
  insert(row: Record<string, unknown>): Promise<{ error: DbError }>
  forms(key: { userId: string; language: string; lemma: string }): Promise<{ forms?: string[]; error: DbError }>
  setForms(key: { userId: string; language: string; lemma: string }, forms: string[]): Promise<{ error: DbError }>
}

/** Postgres's "that row already exists" (the word is already in the bank). */
const ALREADY_SAVED = '23505'

/** The same word saved twice at once is one save, so a quick double tap never races itself. */
const inFlight = new Map<string, Promise<void>>()

/**
 * Saves a word with the host's clip it came from (PC-1018-02). Insert first: a word already in the
 * bank comes back as a conflict, and only then is the new form merged in, so two quick taps never
 * collide into a false error. Every step checks its error, so it only says saved when it was.
 */
export function saveWordWith(
  store: WordStore,
  userId: string,
  w: { lemma: string; form: string; meaning: string; language: string; episodeId: string; clip: Clip; sentence: string },
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  const lemma = normalizeToken(w.lemma, w.language) || w.lemma
  const form = normalizeToken(w.form, w.language) || w.form
  const key = { userId, language: w.language, lemma }
  const flightKey = `${userId}|${w.language}|${lemma}|${form}`
  const running = inFlight.get(flightKey)
  if (running) return running
  const job = (async () => {
    const { error } = await store.insert({ user_id: userId, language: w.language, lemma, forms: [form], meaning: w.meaning, episode_id: w.episodeId, clip: w.clip, sentence: w.sentence, review: newReview(now()) })
    if (!error) return
    if (error.code !== ALREADY_SAVED) throw new Error(SAVE_WORD_FAILED)
    // Already saved, perhaps from another episode: add this form if it's new.
    for (let attempt = 0; attempt < 2; attempt++) {
      const got = await store.forms(key)
      if (got.error || !got.forms) throw new Error(SAVE_WORD_FAILED)
      if (got.forms.includes(form)) return
      const { error: updateError } = await store.setForms(key, [...got.forms, form])
      if (!updateError) return
    }
    throw new Error(SAVE_WORD_FAILED)
  })().finally(() => inFlight.delete(flightKey))
  inFlight.set(flightKey, job)
  return job
}

const supabaseWords: WordStore = {
  insert: async (row) => ({ error: (await supabase.from('saved_words').insert(row)).error }),
  forms: async (k) => {
    const { data, error } = await supabase.from('saved_words').select('forms').eq('user_id', k.userId).eq('language', k.language).eq('lemma', k.lemma).maybeSingle()
    return { forms: (data?.forms as string[] | undefined) ?? undefined, error }
  },
  setForms: async (k, forms) => ({ error: (await supabase.from('saved_words').update({ forms }).eq('user_id', k.userId).eq('language', k.language).eq('lemma', k.lemma)).error }),
}

/** Saves a word with the host's clip it came from. Saving it again from another episode adds the new form. */
export async function saveWord(
  userId: string,
  w: { lemma: string; form: string; meaning: string; language: string; episodeId: string; clip: Clip; sentence: string },
): Promise<void> {
  if (config.demo) return
  return saveWordWith(supabaseWords, userId, w)
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
