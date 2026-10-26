import { FEEDBACK_LIMITS, type FeedbackNote } from '@polycast/core'
import type { Sql } from './db'

/** The private 'feedback' storage bucket (PC-1025-05). Tests pass an in-memory one. */
export interface FeedbackStorage {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>
  remove(paths: string[]): Promise<void>
}

/** Saves a 'Tell Finlay' note, and its screenshot if there is one. Returns the note's id. */
export async function saveFeedback(sql: Sql, storage: FeedbackStorage | undefined, userId: string, note: FeedbackNote): Promise<string> {
  const [row] = await sql`
    insert into feedback (user_id, message, screen, app_version, language)
    values (${userId}, ${note.message}, ${note.screen}, ${note.appVersion}, ${note.language}) returning id`
  const id = row!.id as string
  if (note.screenshot && storage) {
    const png = note.screenshot[0] === 0x89
    const path = `${id}.${png ? 'png' : 'jpg'}`
    try {
      await storage.put(path, note.screenshot, png ? 'image/png' : 'image/jpeg')
      await sql`update feedback set screenshot_path = ${path} where id = ${id}`
    } catch (e) {
      // The words matter more than the picture: keep the note even if the upload fails.
      console.error('feedback screenshot upload failed', e)
    }
  }
  return id
}

/** Deletes notes, and their screenshots, older than 90 days. Returns how many went. */
export async function forgetOldFeedback(sql: Sql, storage: FeedbackStorage | undefined, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - FEEDBACK_LIMITS.keepDays * 24 * 60 * 60_000)
  const old = await sql`select id, screenshot_path from feedback where created_at < ${cutoff}`
  if (!old.length) return 0
  const paths = old.map((r) => r.screenshot_path as string | null).filter((p): p is string => Boolean(p))
  if (paths.length && storage) await storage.remove(paths)
  await sql`delete from feedback where id = any(${old.map((r) => r.id as string)}::uuid[])`
  return old.length
}

/** A learner's screenshots, removed before their account (and so their notes) is deleted. */
export async function forgetFeedbackScreenshots(sql: Sql, storage: FeedbackStorage | undefined, userId: string): Promise<void> {
  if (!storage) return
  const rows = await sql`select screenshot_path from feedback where user_id = ${userId} and screenshot_path is not null`
  if (rows.length) await storage.remove(rows.map((r) => r.screenshot_path as string))
}
