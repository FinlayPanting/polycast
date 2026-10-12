import type { Segment } from '@polycast/core'
import { languageName } from './languages'
import { mapLimit, withRetry } from '../retry'
import type { TextModel } from '../providers/types'
import type { UsageMeter } from '../budget'

const BATCH = 60

const SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, translation: { type: 'string' } },
        required: ['id', 'translation'],
      },
    },
  },
  required: ['lines'],
}

/**
 * Translates subtitle lines in batches, with the lines either side as context so pronouns and
 * half-sentences read naturally. Returns new segments with `translation` filled.
 */
export async function translateSegments(
  segments: Segment[],
  from: string,
  to: string,
  model: TextModel,
  meter: UsageMeter,
): Promise<Segment[]> {
  const batches: Segment[][] = []
  for (let i = 0; i < segments.length; i += BATCH) batches.push(segments.slice(i, i + BATCH))

  const system =
    `You translate podcast subtitles from ${languageName(from)} into natural, plain ${languageName(to)} for a language learner. ` +
    'Translate meaning, not word for word, but keep the speaker’s tone. Keep names as they are. ' +
    'Return one translation for every id you are given, in the same order.'

  const translated = await mapLimit(batches, 3, async (batch, b) => {
    const before = batches[b - 1]?.slice(-3) ?? []
    const after = batches[b + 1]?.slice(0, 3) ?? []
    const prompt = [
      before.length ? `Context before (do not translate):\n${before.map((s) => s.text).join('\n')}\n` : '',
      'Translate these lines:',
      ...batch.map((s) => `${s.id}: ${s.text}`),
      after.length ? `\nContext after (do not translate):\n${after.map((s) => s.text).join('\n')}` : '',
    ].join('\n')

    const { data, usage } = await withRetry(() => model.generateJson<{ lines: { id: string; translation: string }[] }>({ system, prompt, schema: SCHEMA }))
    meter.add(usage)
    const byId = new Map(data.lines.map((l) => [l.id, l.translation.trim()]))
    return batch.map((s) => ({ ...s, translation: byId.get(s.id) || undefined }))
  })
  return translated.flat()
}
