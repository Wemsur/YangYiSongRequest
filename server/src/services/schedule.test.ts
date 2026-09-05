import { describe, expect, it } from 'vitest'
import { assertScheduleDate, nextOrderNo } from './schedule.js'

function captureError(callback: () => void) {
  try {
    callback()
  } catch (error) {
    return error
  }
  throw new Error('预期抛出错误')
}

describe('排期日期校验', () => {
  const today = '2026-09-05'

  it('接受边界内的日期', () => {
    expect(() => assertScheduleDate(today, today, 30)).not.toThrow()
    expect(() => assertScheduleDate('2026-10-05', today, 30)).not.toThrow()
  })

  it('拒绝过去和超出范围的日期', () => {
    expect(captureError(() => assertScheduleDate('2026-09-04', today, 30))).toMatchObject({
      code: 'DATE_PAST',
    })
    expect(captureError(() => assertScheduleDate('2026-10-06', today, 30))).toMatchObject({
      code: 'DATE_TOO_FAR',
    })
  })

  it('拒绝非标准日期格式', () => {
    expect(captureError(() => assertScheduleDate('2026/09/05', today, 30))).toMatchObject({
      code: 'BAD_DATE',
    })
  })
})

describe('排期顺序冲突', () => {
  it('空时段从 1 开始', () => {
    expect(nextOrderNo([])).toBe(1)
  })

  it('始终追加到现有最大序号之后', () => {
    expect(nextOrderNo([1, 3, 2])).toBe(4)
    expect(nextOrderNo([-1, -2, 5])).toBe(6)
  })
})
