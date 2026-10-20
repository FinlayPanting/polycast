import { describe, expect, it } from 'vitest'
import { plusScreenVisit, type PlusScreenEvent } from './plusScreenCount'

describe('counting who sees the Plus screen (PC-1018-08)', () => {
  it('counts an opening, and a close without buying once', () => {
    const sent: PlusScreenEvent[] = []
    const v = plusScreenVisit(async (e) => void sent.push(e))
    expect(sent).toEqual(['opened'])
    v.close()
    v.close()
    expect(sent).toEqual(['opened', 'left'])
  })

  it('does not count a close after buying or restoring', () => {
    const sent: PlusScreenEvent[] = []
    const v = plusScreenVisit(async (e) => void sent.push(e))
    v.becamePlus()
    v.close()
    expect(sent).toEqual(['opened'])
  })

  it('never throws when the send fails', () => {
    const v = plusScreenVisit(() => Promise.reject(new Error('offline')))
    expect(() => v.close()).not.toThrow()
  })
})
