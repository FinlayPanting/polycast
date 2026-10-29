import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

describe('the server image Railway builds', () => {
  const docker = read('server/Dockerfile')
  const copied = docker.split('\n').filter((l) => l.startsWith('COPY ')).flatMap((l) => l.slice(5).trim().split(/\s+/).slice(0, -1))

  it('copies every patch pnpm will look for, or the install fails and the deploy never happens', () => {
    const patched = Object.values(JSON.parse(read('package.json')).pnpm?.patchedDependencies ?? {}) as string[]
    for (const file of patched) expect(copied.some((c) => file === c || file.startsWith(`${c.replace(/\/$/, '')}/`)), file).toBe(true)
  })

  it('copies the files the frozen install needs', () => {
    for (const f of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) expect(copied).toContain(f)
    expect(docker).toContain('pnpm install --frozen-lockfile')
  })
})
