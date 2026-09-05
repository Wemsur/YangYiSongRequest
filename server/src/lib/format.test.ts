import { describe, expect, it } from 'vitest'
import { contentDisposition, duration } from './format.js'

describe('时长格式化', () => {
  it('毫秒转分秒，秒数补零', () => {
    expect(duration(326_000)).toBe('5:26')
    expect(duration(65_000)).toBe('1:05')
  })

  it('拿不到时长时给占位符，不显示 0:00 误导人', () => {
    expect(duration(0)).toBe('--:--')
    expect(duration(Number.NaN)).toBe('--:--')
  })
})

describe('下载文件名', () => {
  it('中文名走 filename*，同时留一份 ASCII 回退', () => {
    const header = contentDisposition('01_起风了 - 买辣椒也用券.mp3')
    expect(header).toContain("filename*=UTF-8''")
    expect(header).toContain(encodeURIComponent('起风了'))
    // 回退名里不能有非 ASCII，否则老浏览器会存出乱码文件名
    expect(header.match(/filename="([^"]*)"/)?.[1]).toMatch(/^[\x20-\x7e]*$/)
  })

  it('回退名里的引号要去掉，免得把 header 截断', () => {
    expect(contentDisposition('a"b.mp3')).toContain('filename="ab.mp3"')
  })
})
