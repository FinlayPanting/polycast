/**
 * Deleting an account, end to end: a fresh Apple authorisation code (for learners who signed in
 * with Apple) so the server can revoke Apple's sign-in link, the server deletion, then the phone's
 * downloaded episodes and lessons, then sign-out.
 */
export interface DeleteAccountDeps {
  signedInWithApple: boolean
  /** Asks Apple for a fresh authorisation code; undefined if the learner cancels or it fails. */
  appleAuthorizationCode: () => Promise<string | undefined>
  deleteOnServer: (appleAuthorizationCode?: string) => Promise<unknown>
  clearDownloads: () => void
  signOut: () => Promise<void>
}

export async function deleteAccount(d: DeleteAccountDeps): Promise<void> {
  // Cancelling Apple's sheet doesn't stop the deletion: the account still goes, just without the revoke.
  const code = d.signedInWithApple ? await d.appleAuthorizationCode().catch(() => undefined) : undefined
  await d.deleteOnServer(code)
  try {
    d.clearDownloads()
  } catch {
    // The account is gone either way; leftover files are only space.
  }
  await d.signOut()
}
