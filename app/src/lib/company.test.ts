import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe("You're not listening alone on the wrap-up (PC-1030-09)", () => {
  it('asks the server for the count and shows only the line it allows', () => {
    const wrap = readFileSync(new URL('../app/listen/[id].tsx', import.meta.url), 'utf8')
    expect(wrap).toMatch(/api\.company\(data\.episode\.id\)\.then\(\(r\) => live && setCompany\(companyLine\(r\.others\)\)/)
    expect(readFileSync(new URL('./api.ts', import.meta.url), 'utf8')).toContain('/v1/episodes/${episodeId}/company')
  })
})
