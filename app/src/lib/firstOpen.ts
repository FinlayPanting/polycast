/**
 * Tells the server, once per install, that Polycast was opened for the first time, so the weekly
 * funnel can start from "opened the app". Sends nothing that identifies the phone or the person.
 * A failed send is tried again on the next launch.
 */
export interface FirstOpenDeps {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  post(): Promise<boolean>
}

export const FIRST_OPEN_KEY = 'polycast.firstOpenCounted'

export async function reportFirstOpen(deps: FirstOpenDeps): Promise<'sent' | 'already' | 'failed'> {
  try {
    if (await deps.getItem(FIRST_OPEN_KEY)) return 'already'
    if (!(await deps.post())) return 'failed'
    await deps.setItem(FIRST_OPEN_KEY, '1')
    return 'sent'
  } catch {
    return 'failed'
  }
}
