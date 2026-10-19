/**
 * App Review's sign-in (PC-1012-04). Apple's reviewers can't receive an emailed code, so this one
 * address signs in with a password instead. The account is made by hand in Supabase (Auth → Users →
 * Add user, auto-confirm) with a strong password that goes only into App Store Connect's App Review
 * Information. Every other address keeps the emailed code; nothing else changes for learners.
 */
export const REVIEW_EMAIL = 'review@polycast.app'

export function isReviewEmail(email: string): boolean {
  return email.trim().toLowerCase() === REVIEW_EMAIL
}
