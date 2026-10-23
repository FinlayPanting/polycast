#!/usr/bin/env node
// Notes for App Review (PC-1022-06): prints the "Notes for Review" text for the next submission,
// from server/changelog.json since the last approved version, ready to paste into App Store
// Connect → the version → App Review Information → Notes (below the standing notes in docs/APP_STORE.md).
// Usage: node scripts/review-notes.mjs [YYYY-MM-DD]   (defaults to lastApproved in docs/app-review.json)
// After Apple approves a version, set lastApproved in docs/app-review.json to the newest date it included.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { parseChangelog, reviewNotes } = await import(join(root, 'packages/core/src/changelog.ts')).catch(async () => {
  // Node without TypeScript support: fall back to the server's tsx.
  const pkg = createRequire(join(root, 'server/package.json')).resolve('tsx/package.json')
  const esm = JSON.parse(readFileSync(pkg, 'utf8')).exports['./esm/api'].import
  const { tsImport } = await import(pathToFileURL(join(dirname(pkg), typeof esm === 'string' ? esm : esm.default)).href)
  return tsImport(join(root, 'packages/core/src/changelog.ts'), import.meta.url)
})
const since = process.argv[2] ?? JSON.parse(readFileSync(join(root, 'docs/app-review.json'), 'utf8')).lastApproved ?? undefined
if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  console.error('Give the date as YYYY-MM-DD')
  process.exit(1)
}
const entries = parseChangelog(JSON.parse(readFileSync(join(root, 'server/changelog.json'), 'utf8')))
const text = reviewNotes(entries, since)
console.log(text)
console.error(`\n(${text.length} of 4000 characters)`)
