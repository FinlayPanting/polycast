import { normalizeToken, type GlossEntry, type Transcript } from '@polycast/core'
import { languageName } from './languages'
import { mapLimit, withRetry } from '../retry'
import type { TextModel } from '../providers/types'
import type { UsageMeter } from '../budget'

const BATCH = 250

const SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: { type: 'object', properties: { form: { type: 'string' }, lemma: { type: 'string' }, meaning: { type: 'string' } }, required: ['form', 'lemma', 'meaning'] },
    },
  },
  required: ['entries'],
}

/**
 * Prepares the tap-a-word meanings for an episode: every distinct word form, its dictionary form and
 * a short meaning as used in the episode, so looking a word up during a listen needs no AI call.
 */
export async function buildGlossary(transcript: Transcript, nativeLanguage: string, model: TextModel, meter: UsageMeter): Promise<Record<string, GlossEntry>> {
  const { language, words, segments } = transcript
  const firstUse = new Map<string, string>()
  for (const seg of segments) {
    for (let i = seg.wordStart; i < seg.wordEnd; i++) {
      const form = normalizeToken(words[i]!.text, language)
      if (form && !/^\d+$/.test(form) && !firstUse.has(form)) firstUse.set(form, seg.text)
    }
  }
  const forms = [...firstUse.keys()]
  const batches: string[][] = []
  for (let i = 0; i < forms.length; i += BATCH) batches.push(forms.slice(i, i + BATCH))

  const system = `You write a learner's glossary for a ${languageName(language)} podcast. For each word form, give its dictionary form (lemma) and a short ${languageName(nativeLanguage)} meaning as used in the example (under 6 words). Names: meaning "a name". Return every form you are given.`
  const results = await mapLimit(batches, 3, async (batch) => {
    const prompt = batch.map((f) => `${f} | ${firstUse.get(f)}`).join('\n')
    const { data, usage } = await withRetry(() => model.generateJson<{ entries: { form: string; lemma: string; meaning: string }[] }>({ system, prompt: `form | example\n${prompt}`, schema: SCHEMA }))
    meter.add(usage)
    return data.entries
  })
  const glossary: Record<string, GlossEntry> = {}
  for (const e of results.flat()) {
    const form = normalizeToken(e.form, language)
    if (firstUse.has(form) && e.meaning.trim()) glossary[form] = { lemma: e.lemma.trim() || form, meaning: e.meaning.trim() }
  }
  return glossary
}
