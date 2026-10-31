import { describe, expect, it } from 'vitest'
import { COMPANY_MIN, companyCount, companyLine } from '../src'

describe("You're not listening alone (PC-1030-09)", () => {
  it('counts only from ten up', () => {
    expect(COMPANY_MIN).toBe(10)
    expect([companyCount(0), companyCount(9), companyCount(10), companyCount(23)]).toEqual([null, null, 10, 23])
  })

  it('says one quiet line, and nothing below ten', () => {
    expect(companyLine(23)).toBe('23 other learners heard this one this week.')
    expect(companyLine(1204)).toBe('1,204 other learners heard this one this week.')
    expect(companyLine(9)).toBeUndefined()
    expect(companyLine(null)).toBeUndefined()
    expect(companyLine(undefined)).toBeUndefined()
  })
})
