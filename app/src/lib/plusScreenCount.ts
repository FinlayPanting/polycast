/**
 * Counting who sees the Plus screen (PC-1018-08): one anonymous 'opened' when it shows, and one
 * 'left' when it closes without a purchase or restore. Sends nothing that identifies the person.
 * A failed send is simply lost; these are rough daily counts.
 */
export type PlusScreenEvent = 'opened' | 'left'

export function plusScreenVisit(post: (event: PlusScreenEvent) => Promise<unknown>) {
  let became = false
  let closed = false
  const send = (e: PlusScreenEvent) => void post(e).catch(() => undefined)
  send('opened')
  return {
    /** A purchase or restore went through: closing now isn't 'left without buying'. */
    becamePlus: () => {
      became = true
    },
    close: () => {
      if (closed) return
      closed = true
      if (!became) send('left')
    },
  }
}
