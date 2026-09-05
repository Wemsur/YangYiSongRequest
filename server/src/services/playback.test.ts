import { describe, expect, it } from 'vitest'
import { isFinished } from './playback.js'

describe('自动标记已播出', () => {
  const today = '2026-09-07'

  it('过去的日期一律算播过了', () => {
    expect(isFinished('2026-09-04', '18:00', today, '08:00')).toBe(true)
  })

  it('今天的时段要等结束时间过了才算', () => {
    expect(isFinished(today, '12:30', today, '12:29')).toBe(false)
    expect(isFinished(today, '12:30', today, '12:30')).toBe(true)
    expect(isFinished(today, '18:00', today, '12:31')).toBe(false)
  })

  it('未来的日期不算', () => {
    expect(isFinished('2026-09-08', '12:30', today, '23:59')).toBe(false)
  })
})
