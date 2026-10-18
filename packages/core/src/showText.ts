/**
 * Show and episode text for the show pages (PC-1017-T1): descriptions without sponsor reads, and
 * the prompt and checks for translating titles and descriptions once for everyone.
 */

/** Sentences that are adverts or housekeeping, not what the show is about. Launch languages and English. */
const SPONSOR = [
  /\bsponsor(ed|s)?\b/i,
  /\bpromo(tion(al)?)? ?code\b/i,
  /\buse (the )?code\b/i,
  /\bad ?choices\b/i,
  /\badvertis(ing|e|ement)\b/i,
  /\bprivacy policy\b/i,
  /\bhosted on\b/i,
  /\b(acast|megaphone|omny|simplecast|libsyn|spreaker|podigee)\.(com|fm|studio)\b/i,
  /\bgesponsert\b|\bwerbung\b|\banzeige\b|\bgutscheincode\b|\brabattcode\b/i,
  /\bsponsrad\b|\bannons(er)?\b|\brabattkod\b/i,
  /\bpatrocinad[oa]\b|\bpublicidad\b|\bc[oó]digo (de )?(descuento|promocional)\b/i,
  /\bsponsoris[ée]\b|\bpublicit[ée]\b|\bcode promo\b/i,
  /\bsponsorizzat[oa]\b|\bpubblicit[àa]\b|\bcodice sconto\b/i,
  /\bpatroc[ií]nio\b|\bpublicidade\b|\bc[oó]digo de desconto\b/i,
]

/** Removes sentences that are sponsor reads or hosting notices. Keeps everything else as written. */
export function stripSponsorReads(text: string): string {
  // A sentence ends at . ! ? or … followed by a space, so "acast.com/privacy" stays in one piece.
  return text
    .split(/(?<=[.!?…]["”»)]*)\s+/u)
    .filter((s) => !SPONSOR.some((r) => r.test(s)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const NAMES: Record<string, string> = { es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', sv: 'Swedish', en: 'English' }

export const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: { translations: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, text: { type: 'string' } }, required: ['id', 'text'] } } },
  required: ['translations'],
} as const

/** One call for a batch of titles and descriptions, numbered so the answers can be matched up. */
export function translationPrompt(texts: string[], readingLanguage: string): { system: string; prompt: string; schema: typeof TRANSLATION_SCHEMA } {
  const to = NAMES[readingLanguage] ?? readingLanguage
  return {
    system: `You translate podcast show and episode titles and descriptions into natural ${to} for language learners browsing a podcast app. Keep names of people, shows and places as they are. Keep it plain and faithful: no additions, no comments, no exclamation marks that aren't in the original. Use British English spelling when writing English.`,
    prompt: `Translate each numbered text into ${to}. Answer with every id and its translation.\n\n${texts.map((t, i) => `${i}: ${t.replace(/\s+/g, ' ')}`).join('\n')}`,
    schema: TRANSLATION_SCHEMA,
  }
}

/** The translations matched to their texts by number; anything missing or empty is null. */
export function checkTranslations(reply: unknown, count: number): (string | null)[] {
  const out: (string | null)[] = new Array(count).fill(null)
  const list = (reply as { translations?: unknown })?.translations
  if (!Array.isArray(list)) return out
  for (const t of list) {
    const id = (t as { id?: unknown })?.id
    const text = (t as { text?: unknown })?.text
    if (typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < count && typeof text === 'string' && text.trim()) out[id] = text.trim()
  }
  return out
}
