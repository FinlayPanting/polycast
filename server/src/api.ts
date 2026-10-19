import { timingSafeEqual } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { cohortAlert, isTipProduct, normaliseMood, REFUSAL_MESSAGES } from '@polycast/core'
import { lookupApple, searchPodcasts, syncFeed, type Fetch } from './catalogue'
import type { LookupHost } from './safeFetch'
import { freeEpisodesClaimed, guideAllowed, requestOwnKeysPreparation, requestPreparation, startListen, type Sql } from './db'
import { forgetUserKeys, OWN_KEYS_LIMITS, OWN_KEYS_MESSAGES, plausibleKey, storeJobKeys, testElevenLabsKey, testGeminiKey } from './ownKeys'
import { discoverShelves } from './discover'
import { cachedMood, MoodUnavailable, recommendByMood } from './mood'
import { translateTexts } from './translations'
import type { TextModel } from './providers/types'
import { SpendCapReached, type SpendGuard } from './budget'
import { countFirstOpen, funnelText, weeklyFunnel } from './funnel'
import { lessonPage, recentLessons } from './lessons'
import { guideById } from './voices'
import { clientAddress, rateLimiter } from './rateLimit'

export type VerifyToken = (token: string) => Promise<string | undefined>

/** Verifies a Supabase access token against the project's published signing keys; returns the user id. */
export function supabaseVerifier(supabaseUrl: string): VerifyToken {
  const jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, jwks, { audience: 'authenticated' })
      return typeof payload.sub === 'string' ? payload.sub : undefined
    } catch {
      return undefined
    }
  }
}

export interface ApiDeps {
  sql: Sql
  verify: VerifyToken
  fetch: Fetch
  podcastIndex?: { key: string; secret: string }
  /** Where Finlay's alerts go (free-cohort thresholds, spending cap). */
  alert?: (kind: string, message: string) => Promise<void>
  /** Shared secret RevenueCat sends with subscription events. */
  revenueCatSecret?: string
  /** Lets the morning email read the weekly funnel (counts only). Unset: the funnel isn't served. */
  funnelToken?: string
  /** Resolves host names before fetching a show's feed; tests pass a fake. Default: DNS. */
  lookupHost?: LookupHost
  /** Gemini, for the one small call behind "Tell Mia what you're in the mood for". Unset: mood picks are off. */
  text?: TextModel
  /** Gemini Flash-Lite, for shared translations of show titles and descriptions (PC-1017-T1). Unset: off. */
  translateText?: TextModel
  /** Tests pass one; otherwise the daily spending cap from settings. */
  guard?: SpendGuard
  /** Encrypts learners' own API keys while their job runs (PC-1017-K1). Unset: own keys are off. */
  ownKeysSecret?: string
}

type Env = { Variables: { userId: string } }

/** Limits on the public removal form. */
export const REMOVAL_LIMITS = { title: 200, contact: 200, message: 2000, perAddressPerHour: 5, overallPerHour: 30 }

/**
 * Fair-use limits per signed-in learner, per minute. Each of these calls reaches outside services
 * (Apple, Podcast Index, the show's feed, the preparation queue), so one script or a broken build
 * can't hammer them on Polycast's behalf. Generous enough that a person never notices.
 */
export const LEARNER_LIMITS = { searchPerMinute: 30, openPerMinute: 30, preparePerMinute: 10, searchMaxChars: 100 }
export const SLOW_DOWN = 'Give it a moment, then try again.'

/**
 * Mood picks a learner can ask for each day (one small Gemini call each, about a tenth of a cent).
 * A mood someone already asked today is answered from the cache and doesn't count.
 */
/** Translating titles and descriptions (PC-1017-T1): per learner, so nobody can run up the shared cap. */
export const TRANSLATE_LIMITS = { perMinute: 30, perDay: 300, titles: 40, titleChars: 200 }

export const MOOD_LIMITS = { freePerDay: 3, plusPerDay: 30 }
export const MOOD_MESSAGES = {
  freeUsed: "That's today's three mood picks. Try again tomorrow, or have a look through the shelves below. Plus gives you more.",
  plusUsed: "That's a lot of moods for one day. Have a look through the shelves below, and try again tomorrow.",
  unavailable: "Mia couldn't find a match just now. Try putting it another way, or have a look through the shelves below.",
  paused: 'Mood picks are resting for today. Have a look through the shelves below.',
}

export function createApi(deps: ApiDeps) {
  const { sql } = deps
  const app = new Hono<Env>()

  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: 'Something went wrong. Please try again.' }, 500)
  })

  app.get('/health', (c) => c.json({ ok: true }))

  // Creators can ask for removal without an account (spec: Creators and rights).
  // It's public and every request pings Finlay's phone, so fields are capped and each address
  // gets a few requests an hour (with an overall ceiling, in case many addresses join in).
  const removalPerAddress = rateLimiter(REMOVAL_LIMITS.perAddressPerHour, 60 * 60_000)
  const removalOverall = rateLimiter(REMOVAL_LIMITS.overallPerHour, 60 * 60_000)
  app.post('/removal-requests', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const podcastTitle = text(body?.podcastTitle)
    const contact = text(body?.contact)
    const message = text(body?.message) || null
    if (!podcastTitle || !contact) return c.json({ error: 'Please give the show’s name and a way to reach you.' }, 400)
    if (podcastTitle.length > REMOVAL_LIMITS.title || contact.length > REMOVAL_LIMITS.contact || (message?.length ?? 0) > REMOVAL_LIMITS.message)
      return c.json({ error: `Please keep the show’s name and contact under ${REMOVAL_LIMITS.title} characters, and the message under ${REMOVAL_LIMITS.message}.` }, 400)
    if (!removalPerAddress.hit(clientAddress((n) => c.req.header(n))) || !removalOverall.hit('all'))
      return c.json({ error: 'We’ve had a few requests from you already. Please try again in an hour.' }, 429)
    await sql`insert into removal_requests (podcast_title, contact, message) values (${podcastTitle}, ${contact}, ${message})`
    await deps.alert?.('removal', `Removal request for "${podcastTitle}" from ${contact}`)
    return c.json({ ok: true })
  })

  // The app says this once per install, before sign-in. Nothing identifies the phone.
  app.post('/events/first-open', async (c) => {
    await countFirstOpen(sql)
    return c.json({ ok: true })
  })

  /** The weekly drop-off funnel, as counts. `week` is a Monday (YYYY-MM-DD); defaults to last week. */
  // The token can also come as ?token=, because the morning email's fetch tool can't send headers.
  // It only unlocks these counts (no personal data, read-only), so a token in a URL is acceptable here.
  const adminAllowed = (c: Context) => {
    const given = c.req.header('Authorization')?.replace(/^Bearer /, '') ?? c.req.query('token')
    return Boolean(deps.funnelToken && given && safeEqual(given, deps.funnelToken))
  }
  app.get('/admin/funnel', async (c) => {
    if (!adminAllowed(c)) return c.json({ error: 'unauthorised' }, 401)
    const week = c.req.query('week') ?? lastMonday(new Date())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return c.json({ error: 'week must be YYYY-MM-DD' }, 400)
    const funnel = await weeklyFunnel(sql, week)
    return c.json({ funnel, text: funnelText(funnel) })
  })

  // Lessons as readable pages, so Claude and Finlay can review what the guide actually says.
  // Same token as the funnel: lesson plans are shared catalogue content, with no learner data.
  app.get('/admin/lessons', async (c) => {
    if (!adminAllowed(c)) return c.json({ error: 'unauthorised' }, 401)
    return c.json({ lessons: await recentLessons(sql) })
  })
  app.get('/admin/lessons/:episodeId', async (c) => {
    if (!adminAllowed(c)) return c.json({ error: 'unauthorised' }, 401)
    const id = c.req.param('episodeId')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Not found' }, 404)
    const page = await lessonPage(sql, id, c.req.query('guide'))
    if (!page) return c.json({ error: 'Not found' }, 404)
    return c.body(page, 200, { 'Content-Type': 'text/markdown; charset=utf-8' })
  })

  /** SQL condition: does a purchase at `at` start a new Plus period for this profile? */
  const newPeriod = (at: Date | null) =>
    at
      ? sql`(plus_period_start is null or ${at}::timestamptz > plus_period_start)`
      : sql`(plus_period_start is null or plus_period_start < now() - interval '27 days')`

  app.post('/webhooks/revenuecat', async (c) => {
    if (!deps.revenueCatSecret || c.req.header('Authorization') !== `Bearer ${deps.revenueCatSecret}`) return c.json({ error: 'unauthorised' }, 401)
    const { event } = await c.req.json()
    // Restore purchases on a new phone or a fresh account: RevenueCat moves the subscription from
    // the old account to the one signed in now. Plus moves with it, along with the month's hours
    // already used (so a transfer can't be used to reset them); the old account goes back to free.
    if (event?.type === 'TRANSFER') {
      const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
      const from = ids(event.transferred_from)
      const to = ids(event.transferred_to)
      if (!to.length) return c.json({ ok: true })
      const [old] = from.length
        ? await sql`select plus_used_sec, plus_period_start from profiles where id::text = any(${from}) and plan = 'plus'
            order by plus_period_start desc nulls last limit 1`
        : []
      await sql`update profiles set plan = 'plus',
        plus_used_sec = ${old ? sql`greatest(plus_used_sec, ${old.plus_used_sec})` : sql`plus_used_sec`},
        plus_period_start = coalesce(${old?.plus_period_start ?? null}::timestamptz, plus_period_start, now())
        where id::text = any(${to})`
      const leaving = from.filter((id) => !to.includes(id))
      if (leaving.length) await sql`update profiles set plan = 'free' where id::text = any(${leaving})`
      return c.json({ ok: true })
    }
    const userId = event?.app_user_id
    if (!userId) return c.json({ ok: true })
    // A tip (PC-1017-K3) is a one-off thank-you: it never touches the learner's plan.
    if (isTipProduct(event.product_id)) return c.json({ ok: true })
    const active = ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE'].includes(event.type)
    const ended = event.type === 'EXPIRATION'
    if (active) {
      // A new paid month starts a fresh 5 hours, but only once: RevenueCat can deliver the same event
      // more than once, so a period starts only if this purchase began after the current one. The
      // purchase time comes from the event; without one, the current month must be over (27+ days).
      const renewing = event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL'
      const purchasedMs = Number(event.purchased_at_ms)
      const purchasedAt = Number.isFinite(purchasedMs) && purchasedMs > 0 ? new Date(Math.min(purchasedMs, Date.now())) : null
      await sql`update profiles set plan = 'plus',
        plus_used_sec = case when ${renewing} and ${newPeriod(purchasedAt)} then 0 else plus_used_sec end,
        plus_period_start = case when ${renewing} and ${newPeriod(purchasedAt)} then coalesce(${purchasedAt}::timestamptz, now())
          else coalesce(plus_period_start, ${purchasedAt}::timestamptz, now()) end
        where id = ${userId}`
    } else if (ended) {
      await sql`update profiles set plan = 'free' where id = ${userId}`
    }
    return c.json({ ok: true })
  })

  const searchLimit = rateLimiter(LEARNER_LIMITS.searchPerMinute, 60_000)
  const openLimit = rateLimiter(LEARNER_LIMITS.openPerMinute, 60_000)
  const prepareLimit = rateLimiter(LEARNER_LIMITS.preparePerMinute, 60_000)
  const moodFree = rateLimiter(MOOD_LIMITS.freePerDay, 24 * 60 * 60_000)
  const moodPlus = rateLimiter(MOOD_LIMITS.plusPerDay, 24 * 60 * 60_000)

  // Everything below needs a signed-in learner.
  app.use('/v1/*', async (c, next) => {
    const auth = c.req.header('Authorization')
    const userId = auth?.startsWith('Bearer ') ? await deps.verify(auth.slice(7)) : undefined
    if (!userId) return c.json({ error: 'Please sign in again.' }, 401)
    c.set('userId', userId)
    await next()
  })

  /** Deletes the learner's account and everything tied to it (spec: Privacy; App Store requirement). */
  app.delete('/v1/account', async (c) => {
    // Profiles, saved words and listens cascade from the auth user. Shared catalogue data stays.
    await sql`delete from auth.users where id = ${c.get('userId')}`
    return c.json({ ok: true })
  })

  app.get('/v1/discover/:language', async (c) => {
    const [profile] = await sql`select interests from profiles where id = ${c.get('userId')}`
    return c.json({ shelves: await discoverShelves(sql, deps.fetch, c.req.param('language'), deps.podcastIndex, profile?.interests ?? []) })
  })

  /** "Tell Mia what you're in the mood for": three shows or prepared episodes with a line on why. */
  app.post('/v1/discover/:language/mood', async (c) => {
    const userId = c.get('userId')
    const language = c.req.param('language')
    const body = await c.req.json().catch(() => ({}))
    const mood = normaliseMood(String(body?.mood ?? ''))
    if (!mood) return c.json({ error: 'Tell Mia what you’re in the mood for first.' }, 400)
    if (!deps.text) return c.json({ error: MOOD_MESSAGES.paused }, 503)
    const [profile] = await sql`select plan, native_language from profiles where id = ${userId}`
    const nativeLanguage = profile?.native_language ?? 'en'
    const cached = await cachedMood(sql, language, mood, nativeLanguage)
    if (cached) return c.json({ mood, picks: cached })
    const plus = profile?.plan === 'plus'
    if (!(plus ? moodPlus : moodFree).hit(userId)) return c.json({ error: plus ? MOOD_MESSAGES.plusUsed : MOOD_MESSAGES.freeUsed }, 429)
    try {
      const picks = await recommendByMood({ sql, fetch: deps.fetch, text: deps.text, podcastIndex: deps.podcastIndex, guard: deps.guard }, language, mood, nativeLanguage)
      return c.json({ mood, picks })
    } catch (e) {
      if (e instanceof SpendCapReached) return c.json({ error: MOOD_MESSAGES.paused }, 503)
      if (e instanceof MoodUnavailable || (e instanceof Error && e.name === 'ProviderError')) return c.json({ error: MOOD_MESSAGES.unavailable }, 502)
      throw e
    }
  })

  /**
   * Shared translations for the show pages (PC-1017-T1): a list's titles in one go, and a show's or
   * episode's description by id (only catalogue text is translated). Made once, kept for everyone,
   * reserved against the daily cap and free to learners. Answers in the learner's own language.
   */
  const translateMinute = rateLimiter(TRANSLATE_LIMITS.perMinute, 60_000)
  const translateDay = rateLimiter(TRANSLATE_LIMITS.perDay, 24 * 60 * 60_000)
  app.post('/v1/translate', async (c) => {
    const userId = c.get('userId')
    if (!deps.translateText) return c.json({ error: 'Translations are off just now.' }, 503)
    if (!translateMinute.hit(userId) || !translateDay.hit(userId)) return c.json({ error: SLOW_DOWN }, 429)
    const body = await c.req.json().catch(() => ({}))
    const titles: string[] = (Array.isArray(body?.titles) ? body.titles : []).slice(0, TRANSLATE_LIMITS.titles).map((t: unknown) => String(t ?? '').slice(0, TRANSLATE_LIMITS.titleChars))
    const [profile] = await sql`select native_language from profiles where id = ${userId}`
    const to = profile?.native_language ?? 'en'
    const [podcast] = body?.podcastId ? await sql`select description from podcasts where id = ${String(body.podcastId)} and not removed` : []
    const [episode] = body?.episodeId ? await sql`select e.description from episodes e join podcasts p on p.id = e.podcast_id where e.id = ${String(body.episodeId)} and not p.removed` : []
    const texts = [...titles, podcast?.description ?? '', episode?.description ?? '']
    try {
      const out = await translateTexts({ sql, text: deps.translateText, guard: deps.guard }, texts, to)
      return c.json({
        to,
        titles: out.slice(0, titles.length),
        podcastDescription: podcast?.description ? out[titles.length] : null,
        episodeDescription: episode?.description ? out[titles.length + 1] : null,
      })
    } catch (e) {
      if (e instanceof SpendCapReached || (e instanceof Error && e.name === 'ProviderError')) return c.json({ error: 'Translations are off just now.' }, 503)
      throw e
    }
  })

  app.get('/v1/search', async (c) => {
    const q = c.req.query('q')?.trim().slice(0, LEARNER_LIMITS.searchMaxChars)
    const language = c.req.query('language') ?? 'sv'
    if (!q) return c.json({ results: [] })
    if (!searchLimit.hit(c.get('userId'))) return c.json({ error: SLOW_DOWN }, 429)
    return c.json({ results: await searchPodcasts(deps.fetch, q, language) })
  })

  /** A show's page: syncs its feed and returns recent episodes with whether each is ready. */
  app.post('/v1/podcasts/open', async (c) => {
    if (!openLimit.hit(c.get('userId'))) return c.json({ error: SLOW_DOWN }, 429)
    const body = await c.req.json()
    let feedUrl: string | undefined = body.feedUrl
    if (!feedUrl && body.podcastId) feedUrl = (await sql`select feed_url from podcasts where id = ${body.podcastId}`)[0]?.feed_url
    // A show already in the catalogue needs no trip to Apple to find its feed (PC-1017-F03).
    if (!feedUrl && body.appleId) feedUrl = (await sql`select feed_url from podcasts where apple_id = ${String(body.appleId)}`)[0]?.feed_url
    const apple = !feedUrl && body.appleId ? await lookupApple(deps.fetch, String(body.appleId)) : undefined
    feedUrl ??= apple?.feedUrl
    if (!feedUrl) return c.json({ error: 'We couldn’t find this show’s feed.' }, 404)
    const [known] = await sql`select id, removed, updated_at from podcasts where feed_url = ${feedUrl}`
    if (known?.removed) return c.json({ error: 'This show isn’t available on Polycast.' }, 404)
    let podcastId: string
    if (known && showIsFresh(known.updated_at, new Date())) podcastId = known.id
    else {
      // Re-read the feed. A known show doesn't wait more than a few seconds for a slow feed: it's
      // served as it was, and the re-read finishes in the background for next time.
      const sync = syncFeed(sql, deps.fetch, feedUrl, apple, { lookupHost: deps.lookupHost }).then((r) => r.podcastId)
      try {
        podcastId = known ? await withDeadline(sync, SHOW_SYNC_WAIT_MS, known.id) : await sync
      } catch {
        if (!known) return c.json({ error: 'We couldn’t load this show right now.' }, 502)
        podcastId = known.id // serve what we have
      }
      sync.catch(() => {})
    }
    const [podcast] = await sql`select id, title, author, artwork, language, description from podcasts where id = ${podcastId}`
    const episodes = await sql`
      select id, title, published, duration_sec, image, status, difficulty, description from episodes
      where podcast_id = ${podcastId} order by published desc nulls last limit 50`
    return c.json({ podcast, episodes })
  })

  // "Use your own API keys" (PC-1017-K1): check a key with a tiny call, and forget every copy.
  const keyTestLimit = rateLimiter(20, 60_000)
  app.post('/v1/keys/test', async (c) => {
    if (!keyTestLimit.hit(c.get('userId'))) return c.json({ error: SLOW_DOWN }, 429)
    const body = await c.req.json().catch(() => ({}))
    if (!plausibleKey(body?.key)) return c.json({ ok: false, message: 'That doesn’t look like a whole key. Paste it again, all of it.' })
    const check = body.provider === 'elevenlabs' ? await testElevenLabsKey(body.key, deps.fetch) : body.provider === 'gemini' ? await testGeminiKey(body.key, deps.fetch) : undefined
    return check ? c.json(check) : c.json({ error: 'Unknown provider' }, 400)
  })
  app.delete('/v1/keys', async (c) => c.json({ ok: true, forgotten: await forgetUserKeys(sql, c.get('userId')) }))

  app.post('/v1/episodes/:id/prepare', async (c) => {
    const userId = c.get('userId')
    if (!prepareLimit.hit(userId)) return c.json({ error: SLOW_DOWN }, 429)
    const [profile] = await sql`select guide_id from profiles where id = ${userId}`
    const guideId = guideById(profile?.guide_id).id
    const body = await c.req.json().catch(() => ({}))
    if (body?.ownKeys) {
      if (!deps.ownKeysSecret) return c.json({ error: OWN_KEYS_MESSAGES.off }, 503)
      const keys = { elevenlabs: body.ownKeys.elevenlabs, gemini: body.ownKeys.gemini }
      if (!plausibleKey(keys.elevenlabs) || !plausibleKey(keys.gemini)) return c.json({ error: OWN_KEYS_MESSAGES.missing }, 400)
      const r = await requestOwnKeysPreparation(sql, userId, c.req.param('id'), guideId, OWN_KEYS_LIMITS.preparationsPerDay)
      if (r.status === 'fairUse') return c.json({ error: OWN_KEYS_MESSAGES.fairUse }, 429)
      if (r.status === 'queued' && r.charge === 'ownKeys') await storeJobKeys(sql, r.jobId, userId, keys, deps.ownKeysSecret)
      return c.json(r)
    }
    const claimedBefore = await freeEpisodesClaimed(sql)
    const result = await requestPreparation(sql, userId, c.req.param('id'), guideId)
    if (result.status === 'refused') return c.json({ ...result, message: REFUSAL_MESSAGES[result.reason] }, 402)
    if (result.status === 'queued' && result.charge === 'freeEpisode') {
      const threshold = cohortAlert(claimedBefore, await freeEpisodesClaimed(sql))
      if (threshold) await notify(deps, 'free-cohort', `${threshold} free episodes have now been claimed.`)
    }
    return c.json(result)
  })

  app.get('/v1/jobs/:id', async (c) => {
    const [job] = await sql`select id, status, stage, episode_id, charge, error from prep_jobs where id = ${c.req.param('id')} and requested_by = ${c.get('userId')}`
    if (!job) return c.json({ error: 'Not found' }, 404)
    const { charge, error, ...rest } = job
    // On their own keys, a failure is their provider's, already in plain words (PC-1017-K1).
    return c.json({ ...rest, ...(charge === 'ownKeys' && job.status === 'failed' && error ? { message: error } : {}) })
  })

  /**
   * The Episode Primer (PC-1017-P1, P4): the warm-up shown before pressing play, for everyone
   * learning the episode, guided or not. Small, so the episode screen can ask for it every time.
   */
  app.get('/v1/episodes/:id/primer', async (c) => {
    const episodeId = c.req.param('id')
    const [episode] = await sql`select e.status from episodes e join podcasts p on p.id = e.podcast_id where e.id = ${episodeId} and not p.removed`
    if (!episode) return c.json({ error: 'Not found' }, 404)
    // Which guide's voice a listen would play now (PC-1017-F01): the learner's own if it's been
    // recorded for this episode, else the one it was prepared with. The screen names that guide.
    const [profile] = await sql`select guide_id from profiles where id = ${c.get('userId')}`
    const [voice] = episode.status === 'ready' ? await sql`select guide_id from lesson_plans where episode_id = ${episodeId} order by (guide_id = ${guideById(profile?.guide_id).id}) desc limit 1` : []
    const [row] = episode.status === 'ready' ? await sql`select plan->'primer' as primer from lesson_plans where episode_id = ${episodeId} and plan ? 'primer' limit 1` : []
    return c.json({ primer: row?.primer ?? null, guideId: voice?.guide_id ?? null })
  })

  /**
   * Everything the player needs for one episode: subtitles, and the lesson plan if the guide is on.
   * `/listen` records that the learner started it; `/lesson` is the same, for saving it to the phone
   * ahead of time, and records nothing.
   */
  for (const route of ['listen', 'lesson'] as const)
  app.post(`/v1/episodes/:id/${route}`, async (c) => {
    const userId = c.get('userId')
    const episodeId = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const [profile] = await sql`select guide_id, guidance_level, plan from profiles where id = ${userId}`
    // The guide intensity chosen for this episode (PC-1017-F13), else the learner's default.
    const chosen = ['light', 'standard', 'handsOn'].includes(body.level) ? (body.level as string) : undefined
    const level = body.guide === false ? null : (chosen ?? profile?.guidance_level ?? 'standard')
    const [episode] = await sql`select e.*, p.title as podcast_title, p.artwork from episodes e join podcasts p on p.id = e.podcast_id where e.id = ${episodeId} and not p.removed`
    if (!episode) return c.json({ error: 'Not found' }, 404)
    if (episode.status !== 'ready') return c.json({ error: 'This episode isn’t ready yet.', status: episode.status }, 409)
    const guided = route === 'listen' ? (await startListen(sql, userId, episodeId, level)).guided : await guideAllowed(sql, userId, episodeId, level)
    const [transcript] = await sql`select language, segments, words, glossary from transcripts where episode_id = ${episodeId}`
    const [plan] = guided
      ? await sql`select plan, guide_id from lesson_plans where episode_id = ${episodeId} order by (guide_id = ${guideById(profile?.guide_id).id}) desc limit 1`
      : []
    return c.json({
      episode: { id: episode.id, title: episode.title, podcastTitle: episode.podcast_title, audioUrl: episode.audio_url, image: episode.image ?? episode.artwork, durationSec: episode.duration_sec },
      transcript,
      guided,
      guidanceLevel: guided ? level : null,
      plan: plan?.plan ?? null,
      // The guide whose voice this plan was recorded in (PC-1017-F01), so the player names the guide
      // the learner actually hears, even after they switch guides in settings.
      guideId: plan?.guide_id ?? null,
      // This is the free episode a free learner chose: its wrap-up gently mentions Plus.
      freeEpisode: profile?.plan !== 'plus' && (await sql`select 1 from prep_jobs where episode_id = ${episodeId} and requested_by = ${userId} and charge = 'freeEpisode' limit 1`).length > 0,
      // Lets the app line the lesson up with the learner's own copy of the episode.
      syncUrl: plan?.plan?.syncUrl ?? (await sql`select plan->>'syncUrl' as url from lesson_plans where episode_id = ${episodeId} and plan ? 'syncUrl' limit 1`)[0]?.url ?? null,
    })
  })

  return app
}

/**
 * Opening a show re-read its feed every time, which could take up to 15 seconds (PC-1017-F03). A
 * show read in the last 15 minutes is served straight from the catalogue; an older one gets a few
 * seconds for the re-read before it's served as it was.
 */
export const SHOW_FRESH_MS = 15 * 60_000
export const SHOW_SYNC_WAIT_MS = 3_000

export function showIsFresh(updatedAt: Date | string | null | undefined, now: Date): boolean {
  if (!updatedAt) return false
  const age = now.getTime() - new Date(updatedAt).getTime()
  return age >= 0 && age < SHOW_FRESH_MS
}

/** The promise's value if it settles in time, else `fallback` (the promise carries on regardless). */
export function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    )
  })
}

/** The Monday that starts the previous full week, UTC. */
export function lastMonday(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const sinceMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - sinceMonday - 7)
  return d.toISOString().slice(0, 10)
}

async function notify(deps: ApiDeps, kind: string, message: string) {
  await deps.sql`insert into alerts (kind, message) values (${kind}, ${message})`
  await deps.alert?.(kind, message).catch((e) => console.error('alert failed', e))
}

export type Api = ReturnType<typeof createApi>
export type { Context }

/** Compares secrets in constant time, so response timing can't reveal how much of a guess was right. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
