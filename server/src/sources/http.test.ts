import { describe, expect, it } from 'vitest'
import { parseLoose } from './http.js'
import { joinArtists, SourceError } from './types.js'

describe('parseLoose', () => {
  it('原样解析纯 JSON', () => {
    expect(parseLoose('qq', '{"a":1}')).toEqual({ a: 1 })
  })

  it('剥掉 jsonp 包裹', () => {
    expect(parseLoose('qq', 'callback({"a":1});')).toEqual({ a: 1 })
  })

  it('剥掉尾随分号', () => {
    expect(parseLoose('kugou', '{"a":1};')).toEqual({ a: 1 })
  })

  it('数组开头不会被误伤', () => {
    expect(parseLoose('kugou', '[1,2]')).toEqual([1, 2])
  })

  it('非法内容抛 SourceError 并带上音源', () => {
    try {
      parseLoose('netease', 'Access Deny !')
      expect.unreachable('应该抛错')
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError)
      expect((error as SourceError).source).toBe('netease')
    }
  })
})

describe('joinArtists', () => {
  it('多位歌手用斜杠连接', () => {
    expect(joinArtists(['黄家驹', 'Beyond'])).toBe('黄家驹 / Beyond')
  })

  it('过滤空值并去空格', () => {
    expect(joinArtists([' 周杰伦 ', '', undefined, null])).toBe('周杰伦')
  })

  it('全空时给出占位', () => {
    expect(joinArtists([undefined, ''])).toBe('未知歌手')
  })
})
