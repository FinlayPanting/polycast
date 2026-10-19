import { describe, expect, it } from 'vitest'
import { showPeek } from './showPeek'

describe("a show's page starts with what the list knew", () => {
  it('carries the title, artwork and author, leaving out what is missing', () => {
    expect(showPeek({ title: 'Svenska Samtal', artwork: 'https://img/a.jpg', author: null })).toEqual({ title: 'Svenska Samtal', artwork: 'https://img/a.jpg' })
    expect(showPeek({})).toEqual({})
  })
})
