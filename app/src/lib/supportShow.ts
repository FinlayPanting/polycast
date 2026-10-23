import { safeFundingUrl } from '@polycast/core'

/**
 * "Support this show" (PC-1018-09): the show's own support page from its feed, as a quiet link on
 * the show page that opens in Safari. The words are always Polycast's own; the site's name is shown
 * so it's clear where the link goes.
 */
export const SUPPORT_LABEL = 'Support this show'

export function supportLink(url: string | null | undefined): { url: string; site: string } | undefined {
  const safe = safeFundingUrl(url ?? undefined)
  if (!safe) return undefined
  return { url: safe, site: new URL(safe).hostname.replace(/^www\./, '') }
}
