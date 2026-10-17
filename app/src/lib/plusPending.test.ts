import { describe, expect, it } from 'vitest'
import { RESTORE_MESSAGES, restoreErrorMessage, waitForServerPlus, withPendingPlus } from './plusPending'

const free = { plan: 'free' as const, id: 'u1' }

describe('Plus the moment it is paid for', () => {
  it("shows Plus while the App Store's confirmation is fresh, then goes by the server", () => {
    expect(withPendingPlus(free, 2000, 1000)?.plan).toBe('plus')
    expect(withPendingPlus(free, 2000, 2000)?.plan).toBe('free')
    expect(withPendingPlus(free, undefined, 1000)?.plan).toBe('free')
    expect(withPendingPlus({ ...free, plan: 'plus' as const }, undefined)?.plan).toBe('plus')
    expect(withPendingPlus(null, 2000, 1000)).toBeNull()
  })

  it('keeps asking the server until it agrees, shrugging off a failed check', async () => {
    const answers: ('free' | 'plus' | Error)[] = ['free', new Error('offline'), 'plus']
    let asked = 0
    const ok = await waitForServerPlus(async () => {
      const a = answers[asked++]!
      if (a instanceof Error) throw a
      return a
    }, { sleep: async () => {} })
    expect(ok).toBe(true)
    expect(asked).toBe(3)
  })

  it('gives up after its tries', async () => {
    let asked = 0
    expect(await waitForServerPlus(async () => (asked++, 'free'), { tries: 4, sleep: async () => {} })).toBe(false)
    expect(asked).toBe(4)
  })

  it("says it couldn't reach the App Store on a dropped signal, never 'nothing found'", () => {
    expect(restoreErrorMessage(Object.assign(new Error('Error performing request.'), { code: 'NETWORK_ERROR' }))).toBe(RESTORE_MESSAGES.offline)
    expect(restoreErrorMessage(new Error('The Internet connection appears to be offline.'))).toBe(RESTORE_MESSAGES.offline)
    expect(restoreErrorMessage(new Error('Store problem'))).toBe(RESTORE_MESSAGES.failed)
    expect(restoreErrorMessage(new Error('Store problem'))).not.toBe(RESTORE_MESSAGES.none)
  })
})
