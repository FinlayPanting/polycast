import { describe, expect, it } from 'vitest'
import { activeTab, barVisible } from './bottomBar'

describe('the bottom bar that never disappears', () => {
  it('shows on the tabs and on every screen pushed over them', () => {
    for (const s of [['(tabs)'], ['(tabs)', 'library'], ['show'], ['episode', '[id]'], ['search'], ['keys'], ['plus'], ['review']]) expect(barVisible(s, 'ios')).toBe(true)
  })

  it('stays off while signing in and onboarding', () => {
    for (const s of [['welcome'], ['email'], ['onboarding', 'language'], []]) expect(barVisible(s, 'ios')).toBe(false)
  })

  it('lets the full player cover it on the iPhone, and steps aside for it on the web preview', () => {
    expect(barVisible(['listen', '[id]'], 'ios')).toBe(true)
    expect(barVisible(['listen', '[id]'], 'web')).toBe(false)
  })

  it('highlights the tab on screen, or the one a pushed screen came from', () => {
    expect(activeTab(['(tabs)'], 'you')).toBe('index')
    expect(activeTab(['(tabs)', 'words'], 'index')).toBe('words')
    expect(activeTab(['episode', '[id]'], 'library')).toBe('library')
  })
})
