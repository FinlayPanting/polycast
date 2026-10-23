import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from '../src/db'
import { dueNudges, nudgeText, planNudge, sendNudges, type NudgeCandidate } from '../src/nudges'
import { freshDatabase, PG_TEST_URL } from './pg'

const run = PG_TEST_URL ? describe : describe.skip
const SERVICE = { freeCohortSize: 100, spendCapReached: false }
const NOON = new Date('2026-10-16T12:00:00Z')

run('new-episode nudges', () => {
  let sql: Sql
  let drop: () => Promise<void>
  let podcast: string
  beforeAll(async () => {
    ;({ sql, drop } = await freshDatabase())
    ;[{ id: podcast }] = (await sql`insert into podcasts (feed_url, title) values ('https://f.example/a.xml', 'Alex & Sigges') returning id`) as any
  })
  afterAll(async () => drop?.())

  const episode = async (daysAgo: number) =>
    ((await sql`insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, language)
      values (${podcast}, ${randomUUID()}, ${`Ep ${daysAgo}`}, now() - make_interval(days => ${daysAgo}), 1800, 'https://a.example/x.mp3', 'sv') returning id`)[0]!.id as string)

  async function learner(token: string | null = 'ExponentPushToken[x]') {
    const id = randomUUID()
    await sql`insert into auth.users (id) values (${id})`
    await sql`update profiles set push_token = ${token} where id = ${id}`
    return id
  }

  it('nudges about a new episode of a finished show, once a week at most', async () => {
    const old = await episode(10)
    const finishedAt = new Date(Date.now() - 9 * 86400_000)
    const lea = await learner()
    await sql`insert into listens (user_id, episode_id, finished_at) values (${lea}, ${old}, ${finishedAt})`
    // Nothing new yet.
    expect(await dueNudges(sql)).toEqual([])

    await episode(3)
    const newest = await episode(1)
    const pushes: any[] = []
    expect(await sendNudges(sql, async (...a) => void pushes.push(a), NOON)).toBe(1)
    expect(pushes).toEqual([['ExponentPushToken[x]', 'Alex & Sigges', 'Mia: A new episode’s out. Shall I get it ready for you?', { episodeId: newest }]])

    // Another episode the next day: still inside the week, so nothing more.
    await episode(0)
    expect(await sendNudges(sql, async (...a) => void pushes.push(a), NOON)).toBe(0)
    expect(pushes).toHaveLength(1)
  })

  it('leaves alone learners without notifications, episodes already heard, and night time', async () => {
    const old = await episode(20)
    const quiet = await learner(null)
    await sql`insert into listens (user_id, episode_id, finished_at) values (${quiet}, ${old}, now() - interval '15 days')`
    const heard = await learner()
    await sql`insert into listens (user_id, episode_id, finished_at) values (${heard}, ${old}, now() - interval '15 days')`
    for (const e of await sql`select id from episodes where published > now() - interval '15 days'`)
      await sql`insert into listens (user_id, episode_id) values (${heard}, ${e.id}) on conflict do nothing`
    expect((await dueNudges(sql)).map((n) => n.userId)).not.toContain(quiet)
    expect((await dueNudges(sql)).map((n) => n.userId)).not.toContain(heard)

    const sleepy = await learner()
    await sql`insert into listens (user_id, episode_id, finished_at) values (${sleepy}, ${old}, now() - interval '15 days')`
    expect((await dueNudges(sql)).map((n) => n.userId)).toContain(sleepy)
    expect(await sendNudges(sql, async () => {}, new Date('2026-10-16T02:00:00Z'))).toBe(0)
  })

  it('never points a free learner who has used their free episode at an episode they can’t get ready (PC-1022-07)', async () => {
    const show = ((await sql`insert into podcasts (feed_url, title) values ('https://f.example/b.xml', 'Gemischtes Hack') returning id`)[0]!.id) as string
    const ep = async (daysAgo: number, status = 'none') =>
      ((await sql`insert into episodes (podcast_id, guid, title, published, duration_sec, audio_url, language, status)
        values (${show}, ${randomUUID()}, ${`Folge ${daysAgo}`}, now() - make_interval(days => ${daysAgo}), 1800, 'https://a.example/y.mp3', 'de', ${status}) returning id`)[0]!.id as string)
    const heard = await ep(30, 'ready')
    const prepared = await ep(25, 'ready')
    await ep(1) // the new one, not prepared
    const used = async (guideId = 'mia') => {
      const id = await learner()
      await sql`update profiles set free_episode_used = true, guide_id = ${guideId} where id = ${id}`
      await sql`insert into listens (user_id, episode_id, finished_at) values (${id}, ${heard}, now() - interval '20 days')`
      return id
    }
    const leo = await used('leo')
    const nudges = await dueNudges(sql, NOON)
    const mine = nudges.find((n) => n.userId === leo)!
    expect(mine.episodeId).toBe(prepared)
    expect(mine.kind).toBe('ready')
    expect(nudgeText(mine).body).toBe('Leo: “Folge 25” is ready when you are. I’ll be there at the pauses.')

    // Nothing prepared to offer: no nudge at all, and the week isn't used up.
    const other = await used()
    await sql`insert into listens (user_id, episode_id) values (${other}, ${prepared})`
    expect((await dueNudges(sql, NOON)).map((n) => n.userId)).not.toContain(other)
    await sendNudges(sql, async () => {}, NOON)
    expect((await sql`select last_nudged_at from profiles where id = ${other}`)[0]!.last_nudged_at).toBeNull()
  })

  it('reads plainly, in the guide’s voice', () => {
    const base = { podcastTitle: 'Gemischtes Hack', episodeTitle: 'Folge 12', guideName: 'Mia' }
    expect(nudgeText({ ...base, kind: 'prepare' })).toEqual({ title: 'Gemischtes Hack', body: 'Mia: A new episode’s out. Shall I get it ready for you?' })
    expect(nudgeText({ ...base, kind: 'ready' }).body).toBe('Mia: The new episode is ready when you are. I’ll be there at the pauses.')
    expect(nudgeText({ ...base, kind: 'readyGuideBack', isNewest: false }).body).toBe(
      'Mia: “Folge 12” is ready to play with subtitles. I’m back to guide you on Monday.',
    )
  })
})

describe('planNudge (PC-1022-07)', () => {
  const candidate = (over: Partial<NudgeCandidate> = {}): NudgeCandidate => ({
    newest: { id: 'new', title: 'New', durationSec: 1800, status: 'none' },
    readyFallback: { id: 'old', title: 'Old' },
    account: { plan: 'free', signupRank: 5, freeEpisodeUsed: false, plusUsedSec: 0 },
    guidedThisWeek: 0,
    ...over,
  })

  it('offers to get the new episode ready only when the learner may', () => {
    expect(planNudge(candidate(), SERVICE)).toMatchObject({ episodeId: 'new', kind: 'prepare' })
    expect(planNudge(candidate({ account: { plan: 'plus', signupRank: 500, freeEpisodeUsed: true, plusUsedSec: 0 } }), SERVICE)).toMatchObject({ kind: 'prepare' })
  })

  it('points to a prepared episode when the new one would hit a wall', () => {
    const used = candidate({ account: { plan: 'free', signupRank: 5, freeEpisodeUsed: true, plusUsedSec: 0 } })
    expect(planNudge(used, SERVICE)).toMatchObject({ episodeId: 'old', kind: 'ready', isNewest: false })
    expect(planNudge({ ...used, readyFallback: undefined }, SERVICE)).toBeUndefined()
    // Outside the free cohort, out of Plus hours, or paused for the day: the same.
    expect(planNudge(candidate({ account: { plan: 'free', signupRank: 101, freeEpisodeUsed: false, plusUsedSec: 0 } }), SERVICE)).toMatchObject({ episodeId: 'old' })
    expect(planNudge(candidate({ account: { plan: 'plus', signupRank: 1, freeEpisodeUsed: true, plusUsedSec: 5 * 3600 } }), SERVICE)).toMatchObject({ episodeId: 'old' })
    expect(planNudge(candidate(), { ...SERVICE, spendCapReached: true })).toMatchObject({ episodeId: 'old' })
  })

  it('a new episode that is ready or already preparing is always fine', () => {
    const used = { plan: 'free' as const, signupRank: 5, freeEpisodeUsed: true, plusUsedSec: 0 }
    expect(planNudge(candidate({ account: used, newest: { id: 'new', title: 'New', durationSec: 1800, status: 'ready' } }), SERVICE)).toMatchObject({ episodeId: 'new', kind: 'ready' })
    expect(planNudge(candidate({ account: used, newest: { id: 'new', title: 'New', durationSec: 1800, status: 'preparing' } }), SERVICE)).toMatchObject({ episodeId: 'new', kind: 'prepare' })
  })

  it('tells a free learner who has had this week’s guided episode when the guide is back', () => {
    const c = candidate({ newest: { id: 'new', title: 'New', durationSec: 1800, status: 'ready' }, guidedThisWeek: 1 })
    expect(planNudge(c, SERVICE)).toMatchObject({ kind: 'readyGuideBack' })
    expect(planNudge({ ...c, account: { ...c.account, plan: 'plus' } }, SERVICE)).toMatchObject({ kind: 'ready' })
  })
})
