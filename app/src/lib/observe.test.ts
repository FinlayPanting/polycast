import { describe, expect, it } from 'vitest'
import { observeConfig } from './observe'

describe('crash reporting', () => {
  it('reports from release builds only, with router timings and nothing about the learner', () => {
    const c = observeConfig()
    expect(c.dispatchInDebug).toBe(false)
    expect(c.integrations?.['expo-router']).toBe(true)
    expect(Object.keys(c).sort()).toEqual(['dispatchInDebug', 'environment', 'integrations'])
  })

  it("keeps Finlay's test builds apart from learners' crashes", () => {
    expect(observeConfig({ testBuild: true }).environment).toBe('test')
  })
})
