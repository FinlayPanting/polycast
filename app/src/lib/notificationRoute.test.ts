import { describe, expect, it } from 'vitest'
import { routeForNotification } from './notificationRoute'

describe('notification taps', () => {
  it('open the episode named in the notification', () => {
    const id = '0b6f8a52-3c1e-4a9e-9f3c-2d6c5a1e7b10'
    expect(routeForNotification({ episodeId: id })).toBe(`/episode/${id}`)
  })
  it('ignore anything else', () => {
    expect(routeForNotification(undefined)).toBeUndefined()
    expect(routeForNotification({ episodeId: '../plus' })).toBeUndefined()
    expect(routeForNotification({ episodeId: 42 })).toBeUndefined()
  })
})
