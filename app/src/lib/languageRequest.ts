/**
 * "Learning something else?" under the language picker (PC-1023-02). A tap tells the server which language
 * someone wanted, once per language per install, with nothing that identifies the phone or the person.
 * The thank-you shows whether or not the send worked: the learner shouldn't have to care.
 */
export interface LanguageRequestDeps {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  post(language: string): Promise<boolean>
}

export const LANGUAGE_REQUESTS_KEY = 'polycast.languageRequests'

export async function requestLanguage(language: string, deps: LanguageRequestDeps): Promise<'sent' | 'already' | 'failed'> {
  try {
    const raw = await deps.getItem(LANGUAGE_REQUESTS_KEY)
    const sent: string[] = raw ? JSON.parse(raw) : []
    if (sent.includes(language)) return 'already'
    if (!(await deps.post(language))) return 'failed'
    await deps.setItem(LANGUAGE_REQUESTS_KEY, JSON.stringify([...sent, language]))
    return 'sent'
  } catch {
    return 'failed'
  }
}

/** What the picker says after a tap. */
export function languageRequestThanks(name: string, code: string): string {
  if (code === 'other') return 'Thanks. Polycast is adding languages one at a time, and every request counts. Meanwhile, one of these six might be fun.'
  return `Thanks, we’ve counted a vote for ${name}. The most-asked-for languages come next. Meanwhile, one of these six might be fun.`
}
