import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { appShowUrl, SHOW_LINK_BASE } from '@polycast/core'

const site = (f: string) => readFileSync(new URL(`../../site/${f}`, import.meta.url), 'utf8')

describe("'Learn with this show' on the website (PC-1030-07)", () => {
  it('has a search on the creators page that asks the server through the site’s own address', () => {
    const page = site('creators.html')
    expect(page).toContain('id="showlink"')
    expect(page).toContain('/api/creators/shows?q=')
    // Results are written as text, never as HTML from Apple's catalogue.
    expect(page).not.toMatch(/innerHTML/)
    const vercel = JSON.parse(site('vercel.json'))
    expect(vercel.rewrites).toContainEqual({ source: '/api/creators/shows', destination: 'https://polycast-production.up.railway.app/creators/shows' })
  })

  it('serves the link’s page at polycast.app/show, opening the show in the app', () => {
    expect(SHOW_LINK_BASE).toBe('https://polycast.app/show')
    const page = site('show.html')
    expect(page).toContain('polycast://show?appleId=${apple}')
    expect(appShowUrl('1')).toBe('polycast://show?appleId=1')
    // Only digits go into the app address.
    expect(page).toContain('/^\\d{1,15}$/.test(apple)')
    expect(page).not.toMatch(/innerHTML/)
  })
})
