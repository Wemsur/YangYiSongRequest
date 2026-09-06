import { describe, expect, it } from 'vitest'
import { assertDailyLimits, normalizeIdentity } from './requests.js'

function captureError(callback: () => void) {
  try {
    callback()
  } catch (error) {
    return error
  }
  throw new Error('预期抛出错误')
}

describe('点歌限额', () => {
  it('允许未达到日限额的提交', () => {
    expect(() => assertDailyLimits(9, 1)).not.toThrow()
    expect(() => assertDailyLimits(9, null)).not.toThrow()
  })

  it('在 IP 达到日限额时返回结构化错误', () => {
    expect(captureError(() => assertDailyLimits(10, 0))).toMatchObject({
      code: 'RATE_LIMIT_IP',
      statusCode: 429,
      detail: { limit: 10, window: 'day' },
    })
  })

  it('在身份达到日限额时拒绝提交', () => {
    expect(captureError(() => assertDailyLimits(0, 2))).toMatchObject({
      code: 'RATE_LIMIT_IDENTITY',
      statusCode: 429,
    })
  })
})

describe('点歌身份校验', () => {
  const classCounts = { G1: 23, G2: 22, G3: 21 } as const

  it('匿名模式拒绝额外身份字段', () => {
    expect(
      captureError(() =>
        normalizeIdentity({ source: 'qq', platformId: '1', grade: 'G1' }, false, classCounts),
      ),
    ).toMatchObject({ code: 'IDENTITY_NOT_REQUIRED' })
  })

  it('实名模式规范化合法身份', () => {
    expect(
      normalizeIdentity(
        { source: 'qq', platformId: '1', grade: 'G2', classNo: 22, requesterName: ' 张三 ' },
        true,
        classCounts,
      ),
    ).toEqual({ grade: 'G2', classNo: 22, requesterName: '张三' })
  })

  it('实名模式拒绝超出年级范围的班级', () => {
    expect(
      captureError(() =>
        normalizeIdentity(
          { source: 'qq', platformId: '1', grade: 'G3', classNo: 22, requesterName: '张三' },
          true,
          classCounts,
        ),
      ),
    ).toMatchObject({ code: 'BAD_CLASS' })
  })
})
