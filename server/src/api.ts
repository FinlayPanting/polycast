import { timingSafeEqual } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { cohortAlert, REFUSAL_MESSAGES } from '@polycast/core'
import { lookupApple, searchPodcasts, syncFeed, type Fetch } from './catalogue'
import { freeEpisodesClaimed, requestPreparation, startListen, type Sql } from './db'
import { discoverShelves } from './discover'
import { countFirstOpen, funnelText, weeklyFunnel } from './funnel'
import { guideById } from './voices'

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
}

type Env = { Variables: { userId: string } }

export function createApi(deps: ApiDeps) {
  const { sql } = deps
  const app = new Hono<Env>()

  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: 'Something went wrong. Please try again.' }, 500)
  })

  app.get('/health', (c) => c.json({ ok: true }))

  // Creators can ask for removal without an account (spec: Creators and rights).
  app.post('/removal-requests', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    if (!body.podcastTitle || !body.contact) return c.json({ error: 'Please give the show’s name and a way to reach you.' }, 400)
    await sql`insert into removal_requests (podcast_title, contact, message) values (${body.podcastTitle}, ${body.contact}, ${body.message ?? null})`
    await deps.alert?.('removal', `Removal request for "${body.podcastTitle}" from ${body.contact}`)
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
  app.get('/admin/funnel', async (c) => {
    const given = c.req.header('Authorization')?.replace(/^Bearer /, '') ?? c.req.query('token')
    if (!deps.funnelToken || !given || !safeEqual(given, deps.funnelToken)) return c.json({ error: 'unauthorised' }, 401)
    const week = c.req.query('week') ?? lastMonday(new Date())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return c.json({ error: 'week must be YYYY-MM-DD' }, 400)
    const funnel = await weeklyFunnel(sql, week)
    return c.json({ funnel, text: funnelText(funnel) })
  })

  app.post('/webhooks/revenuecat', async (c) => {
    if (!deps.revenueCatSecret || c.req.header('Authorization') !== `Bearer ${deps.revenueCatSecret}`) return c.json({ error: 'unauthorised' }, 401)
    const { event } = await c.req.json()
    const userId = event?.app_user_id
    if (!userId) return c.json({ ok: true })
    const active = ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE'].includes(event.type)
    const ended = event.type === 'EXPIRATION'
    if (active) {
      // A new paid month starts a fresh 5 hours.
      const renewing = event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL'
      await sql`update profiles set plan = 'plus',
        plus_period_start = case when ${renewing} then now() else coalesce(plus_period_start, now()) end,
        plus_used_sec = case when ${renewing} then 0 else plus_used_sec end
        where id = ${userId}`
    } else if (ended) {
      await sql`update profiles set plan = 'free' where id = ${userId}`
    }
    return c.json({ ok: true })
  })

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

  app.get('/v1/search', async (c) => {
    const q = c.req.query('q')?.trim()
    const language = c.req.query('language') ?? 'sv'
    if (!q) return c.json({ results: [] })
    return c.json({ results: await searchPodcasts(deps.fetch, q, language) })
  })

  /** A show's page: syncs its feed and returns recent episodes with whether each is ready. */
  app.post('/v1/podcasts/open', async (c) => {
    const body = await c.req.json()
    let feedUrl: string | undefined = body.feedUrl
    if (!feedUrl && body.podcastId) feedUrl = (await sql`select feed_url from podcasts where id = ${body.podcastId}`)[0]?.feed_url
    const apple = body.appleId ? await lookupApple(deps.fetch, String(body.appleId)) : undefined
    feedUrl ??= apple?.feedUrl
    if (!feedUrl) return c.json({ error: 'We couldn’t find this show’s feed.' }, 404)
    const [known] = await sql`select id, removed from podcasts where feed_url = ${feedUrl}`
    if (known?.removed) return c.json({ error: 'This show isn’t available on Polycast.' }, 404)
    let podcastId: string
    try {
      podcastId = (await syncFeed(sql, deps.fetch, feedUrl, apple)).podcastId
    } catch {
      if (!known) return c.json({ error: 'We couldn’t load this show right now.' }, 502)
      podcastId = known.id // serve what we have
    }
    const [podcast] = await sql`select id, title, author, artwork, language from podcasts where id = ${podcastId}`
    const episodes = await sql`
      select id, title, published, duration_sec, image, status, difficulty from episodes
      where podcast_id = ${podcastId} order by published desc nulls last limit 50`
    return c.json({ podcast, episodes })
  })

  app.post('/v1/episodes/:id/prepare', async (c) => {
    const userId = c.get('userId')
    const [profile] = await sql`select guide_id from profiles where id = ${userId}`
    const guideId = guideById(profile?.guide_id).id
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
    const [job] = await sql`select id, status, stage, episode_id from prep_jobs where id = ${c.req.param('id')} and requested_by = ${c.get('userId')}`
    return job ? c.json(job) : c.json({ error: 'Not found' }, 404)
  })

  /** Everything the player needs for one episode: subtitles, and the lesson plan if the guide is on. */
  app.post('/v1/episodes/:id/listen', async (c) => {
    const userId = c.get('userId')
    const episodeId = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const [profile] = await sql`select guide_id, guidance_level from profiles where id = ${userId}`
    const level = body.guide === false ? null : (profile?.guidance_level ?? 'standard')
    const [episode] = await sql`select e.*, p.title as podcast_title, p.artwork from episodes e join podcasts p on p.id = e.podcast_id where e.id = ${episodeId} and not p.removed`
    if (!episode) return c.json({ error: 'Not found' }, 404)
    if (episode.status !== 'ready') return c.json({ error: 'This episode isn’t ready yet.', status: episode.status }, 409)
    const { guided } = await startListen(sql, userId, episodeId, level)
    const [transcript] = await sql`select language, segments, words, glossary from transcripts where episode_id = ${episodeId}`
    const [plan] = guided
      ? await sql`select plan from lesson_plans where episode_id = ${episodeId} order by (guide_id = ${guideById(profile?.guide_id).id}) desc limit 1`
      : []
    return c.json({
      episode: { id: episode.id, title: episode.title, podcastTitle: episode.podcast_title, audioUrl: episode.audio_url, image: episode.image ?? episode.artwork, durationSec: episode.duration_sec },
      transcript,
      guided,
      guidanceLevel: guided ? level : null,
      plan: plan?.plan ?? null,
      // Lets the app line the lesson up with the learner's own copy of the episode.
      syncUrl: plan?.plan?.syncUrl ?? (await sql`select plan->>'syncUrl' as url from lesson_plans where episode_id = ${episodeId} and plan ? 'syncUrl' limit 1`)[0]?.url ?? null,
    })
  })

  return app
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
