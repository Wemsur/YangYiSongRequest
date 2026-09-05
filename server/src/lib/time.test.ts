import { describe, expect, it } from 'vitest'
import { addDays, isWeekend, shanghaiDate, shanghaiDayStart, shanghaiTime } from './time.js'

describe('东八区换算', () => {
  it('UTC 傍晚已经是东八区的第二天', () => {
    expect(shanghaiDate(new Date('2026-09-04T16:30:00Z'))).toBe('2026-09-05')
    expect(shanghaiDate(new Date('2026-09-04T15:59:00Z'))).toBe('2026-09-04')
  })

  it('东八区当天零点对应前一天 16:00 UTC，限流计数靠它', () => {
    expect(shanghaiDayStart(new Date('2026-09-05T02:00:00Z')).toISOString()).toBe(
      '2026-09-04T16:00:00.000Z',
    )
  })

  it('时刻也按东八区', () => {
    expect(shanghaiTime(new Date('2026-09-05T01:18:00Z'))).toBe('09:18')
  })

  it('加减天数跨月正确', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('周末判定', () => {
    expect(isWeekend('2026-09-05')).toBe(true)
    expect(isWeekend('2026-09-06')).toBe(true)
    expect(isWeekend('2026-09-07')).toBe(false)
  })
})
