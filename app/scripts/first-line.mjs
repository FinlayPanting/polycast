#!/usr/bin/env node
/**
 * Count the steps to Mia's first line (PC-1028-07). Builds the signed-out browser preview, then walks it
 * like a brand-new learner taking the quickest way forward on every screen, from the first open to the
 * moment the guide first speaks in a listen ("Mia is speaking"). It counts screens, taps and typed
 * fields, and fails if any of them grows past the budget in `app/first-line.json`, so new onboarding
 * steps can't quietly pile up between a new learner and the "aha". If it shrinks, it says so: lower the
 * budget in the same commit.
 *
 * The walk isn't a fixed script: on each screen it presses the first forward button it recognises
 * (FORWARD, in order), types into empty fields, picks the first language offered, and from Discover
 * opens the first episode that's ready now. A new screen with a Continue button is walked and counted.
 *
 * Run by `pnpm check`. Skips (exit 0, says so) when Playwright isn't installed, as on a Mac without it.
 * The preview build is reused while nothing in the app or packages/core has changed.
 *
 * Usage: node app/scripts/first-line.mjs [--json]
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APP = join(fileURLToPath(import.meta.url), '../..')
const ROOT = join(APP, '..')
const OUT = join(APP, 'dist-first-line')
const STAMP = join(OUT, '.source-hash')
const BUDGET_FILE = join(APP, 'first-line.json')
const GUIDE_SPEAKING = /^(Mia|Leo) is speaking$/
const MAX_STEPS = 40

/** Forward buttons, most specific first. Matched against a button's label or text, exactly. */
export const FORWARD = ['Continue with email', 'Send code', 'Sign in', 'Skip for now', 'Continue', 'Start listening', 'Listen with Mia', 'Listen with Leo', 'Skip and play']

/** Whether the walk's counts fit the budget; the lines say what grew or shrank. */
export function compareToBudget(counts, budget) {
  const grew = []
  const shrank = []
  for (const k of ['screens', 'taps', 'typed']) {
    if (counts[k] > budget[k]) grew.push(`${k}: ${counts[k]}, budget ${budget[k]}`)
    else if (counts[k] < budget[k]) shrank.push(`${k}: ${counts[k]}, budget ${budget[k]}`)
  }
  return { ok: grew.length === 0, grew, shrank }
}

/**
 * A screen is its path; on the email screen a change of heading counts as a new screen too, so if the address
 * and the code are ever split onto two steps again, both are counted (since PC-1030-04 they share one).
 */
export function screenKey(pathname, heading) {
  return pathname === '/email' ? `${pathname}#${heading ?? ''}` : pathname
}

function sourceHash() {
  const h = createHash('sha256')
  const walk = (dir) => {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f)
      const s = statSync(p)
      if (s.isDirectory()) {
        if (!/^(node_modules|dist.*|\.expo|ios|android)$/.test(f)) walk(p)
      } else if (!/\.test\.tsx?$/.test(f)) h.update(relative(ROOT, p)).update(readFileSync(p))
    }
  }
  for (const d of [join(APP, 'src'), join(ROOT, 'packages/core/src')]) walk(d)
  for (const f of ['app.json', 'app.config.js', 'package.json']) if (existsSync(join(APP, f))) h.update(f).update(readFileSync(join(APP, f)))
  return h.digest('hex')
}

function build() {
  const hash = sourceHash()
  if (existsSync(STAMP) && readFileSync(STAMP, 'utf8') === hash && existsSync(join(OUT, 'index.html'))) return
  // --clear: Metro's cache keeps the EXPO_PUBLIC_ values of an earlier preview build otherwise.
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-first-line', '--clear'], {
    cwd: APP,
    env: { ...process.env, EXPO_PUBLIC_DEMO: '1', EXPO_PUBLIC_DEMO_SIGNED_OUT: '1', CI: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  writeFileSync(STAMP, hash)
}

function loadPlaywright() {
  for (const base of [APP, ROOT]) {
    try {
      return createRequire(join(base, 'package.json'))('playwright')
    } catch {}
  }
  try {
    const global = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    return createRequire(join(global, 'noop.js'))('playwright')
  } catch {
    return undefined
  }
}

const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.svg': 'image/svg+xml' }

function serve() {
  const server = createServer((req, res) => {
    let p = join(OUT, decodeURIComponent((req.url ?? '/').split('?')[0]))
    if (!p.startsWith(OUT) || !existsSync(p) || statSync(p).isDirectory()) p = join(OUT, 'index.html')
    res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' })
    createReadStream(p).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function walk(playwright, url) {
  const browser = await playwright.chromium.launch()
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const counts = { screens: 0, taps: 0, typed: 0 }
  const path = []
  const seen = new Set()
  const picked = new Set()
  const tap = async (locator, what) => {
    await locator.click()
    counts.taps++
    path.push(`tap ${what}`)
    await page.waitForTimeout(700)
  }
  try {
    await page.goto(url)
    await page.waitForTimeout(2500)
    for (let step = 0; step < MAX_STEPS; step++) {
      const pathname = new URL(page.url()).pathname
      const heading = await page.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.innerText).find((t) => /^(Sign in with email|Check your email)/.test(t ?? ''))?.split('\n')[0])
      const key = screenKey(pathname, heading)
      if (!seen.has(key)) {
        seen.add(key)
        counts.screens++
        path.push(`screen ${key}`)
      }
      if (await page.getByLabel(GUIDE_SPEAKING).count()) return { counts, path, reached: true }

      // Type into empty fields: an email address, then a code.
      let typed = false
      for (const input of await page.locator('input:visible').all()) {
        if ((await input.inputValue()) !== '') continue
        const kind = `${(await input.getAttribute('type')) ?? ''} ${(await input.getAttribute('placeholder')) ?? ''} ${(await input.getAttribute('aria-label')) ?? ''}`
        if (/search/i.test(kind)) continue
        // The code field sits under the address on the same screen (PC-1030-04), so it's told apart by its own label.
        const isCode = /code|one-time|000000/i.test(kind)
        await input.fill(!isCode && (/mail|@/i.test(kind) || (pathname === '/email' && !heading?.startsWith('Check'))) ? 'new.learner@example.com' : '123456')
        counts.typed++
        path.push('type')
        typed = true
      }
      if (typed) await page.waitForTimeout(300)

      // A language to pick, if this screen asks for one and none is chosen.
      const radios = page.getByRole('radio')
      if (pathname.startsWith('/onboarding/language') && !picked.has(key) && (await radios.count())) {
        picked.add(key)
        await tap(radios.first(), 'first language')
        continue
      }

      // Discover: open the first episode that's ready now.
      if (pathname === '/' || pathname === '/index') {
        const ready = page.locator('[aria-label$=", ready now"]').first()
        if (await ready.count()) {
          await tap(ready, 'first ready episode')
          continue
        }
      }

      let moved = false
      for (const label of FORWARD) {
        const button = page.getByRole('button', { name: label, exact: true }).locator('visible=true').last()
        if (await button.count()) {
          await tap(button, label)
          moved = true
          break
        }
      }
      if (!moved) {
        await page.waitForTimeout(1500)
        if (await page.getByLabel(GUIDE_SPEAKING).count()) return { counts, path, reached: true }
        return { counts, path, reached: false, stuckAt: key }
      }
    }
    return { counts, path, reached: false, stuckAt: 'too many steps' }
  } finally {
    await browser.close()
  }
}

async function main() {
  const playwright = loadPlaywright()
  if (!playwright) {
    console.log('first line: Playwright not installed here, skipped')
    return
  }
  build()
  const server = await serve()
  const { port } = server.address()
  let result
  try {
    result = await walk(playwright, `http://127.0.0.1:${port}/`)
  } finally {
    server.close()
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 1))
  if (!result.reached) {
    console.error(`first line BLOCKING: the walk never reached the guide's first line (stuck at ${result.stuckAt}). Path: ${result.path.join(' > ')}`)
    process.exit(1)
  }
  const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'))
  const { ok, grew, shrank } = compareToBudget(result.counts, budget)
  const summary = `${result.counts.screens} screens, ${result.counts.taps} taps, ${result.counts.typed} typed fields`
  if (!ok) {
    console.error(`first line BLOCKING: more steps before Mia's first line (${grew.join('; ')}). Path: ${result.path.join(' > ')}`)
    process.exit(1)
  }
  console.log(`first line: ${summary} to Mia's first line${shrank.length ? ` (fewer than the budget: lower app/first-line.json to match)` : ''}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => {
  console.error('first line BLOCKING:', e)
  process.exit(1)
})
