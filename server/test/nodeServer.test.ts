import { serve } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createApi } from '../src/api'

describe('the API runs on @hono/node-server 2 (PC-1029-06)', () => {
  it('answers /health over real HTTP, as main.ts serves it', async () => {
    const api = createApi({ sql: {} as any, verify: async () => undefined, fetch, commit: 'abc1234' })
    const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const s = serve({ fetch: api.fetch, port: 0 }, () => resolve(s))
    })
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, commit: 'abc1234' })
      const missing = await fetch(`http://127.0.0.1:${port}/v1/discover/sv`)
      expect(missing.status).toBe(401)
    } finally {
      await new Promise((r) => server.close(r))
    }
  })

  it('uses a version clear of GHSA-rmxm-3fg6-px4f', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    const { createRequire } = await import('node:module')
    const { dirname, join } = await import('node:path')
    let dir = dirname(createRequire(import.meta.url).resolve('@hono/node-server'))
    while (!existsSync(join(dir, 'package.json')) || JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name !== '@hono/node-server') dir = dirname(dir)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const [major, minor, patch] = pkg.version.split('.').map(Number)
    expect(major * 1e6 + minor * 1e3 + patch).toBeGreaterThanOrEqual(2_001_003)
  })
})
