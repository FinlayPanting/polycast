import { describe, expect, it } from 'vitest'
import { deleteAccount, type DeleteAccountDeps } from './deleteAccount'

function deps(over: Partial<DeleteAccountDeps> = {}) {
  const log: string[] = []
  const d: DeleteAccountDeps = {
    signedInWithApple: true,
    appleAuthorizationCode: async () => 'code-1',
    deleteOnServer: async (code) => void log.push(`server:${code ?? '-'}`),
    clearDownloads: () => void log.push('clear'),
    signOut: async () => void log.push('signout'),
    ...over,
  }
  return { d, log }
}

describe('deleting an account', () => {
  it('passes Apple’s code to the server, then clears downloads and signs out', async () => {
    const { d, log } = deps()
    await deleteAccount(d)
    expect(log).toEqual(['server:code-1', 'clear', 'signout'])
  })

  it('still deletes if the learner cancels Apple’s sheet, or signed in by email', async () => {
    for (const over of [{ appleAuthorizationCode: async () => { throw new Error('cancelled') } }, { signedInWithApple: false }]) {
      const { d, log } = deps(over)
      await deleteAccount(d)
      expect(log).toEqual(['server:-', 'clear', 'signout'])
    }
  })

  it('keeps everything on the phone if the server deletion fails', async () => {
    const { d, log } = deps({ deleteOnServer: async () => { throw new Error('offline') } })
    await expect(deleteAccount(d)).rejects.toThrow('offline')
    expect(log).toEqual([])
  })
})
