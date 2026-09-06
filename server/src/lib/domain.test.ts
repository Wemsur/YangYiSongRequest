import { describe, expect, it } from 'vitest';
import {
  decodeBool,
  decodeDetail,
  decodeInt,
  decodeWordList,
  encodeDetail,
  encodeWordList,
  isGrade,
  isSource,
} from './domain.js';

describe('SQLite 压平字段的编解码', () => {
  it('词表去空去重，存成 JSON 数组', () => {
    expect(encodeWordList([' 违规 ', '违规', '', '广告'])).toBe('["违规","广告"]');
    expect(decodeWordList('["违规","广告"]')).toEqual(['违规', '广告']);
  });

  it('坏数据不能把页面搞崩', () => {
    expect(decodeWordList('这不是 JSON')).toEqual([]);
    expect(decodeWordList(null)).toEqual([]);
    expect(decodeWordList('{"not":"array"}')).toEqual([]);
    expect(decodeDetail('坏的')).toEqual({ raw: '坏的' });
    expect(encodeDetail(null)).toBeNull();
  });

  it('布尔与整数都带兜底值', () => {
    expect(decodeBool(undefined, true)).toBe(true);
    expect(decodeBool('false', true)).toBe(false);
    expect(decodeInt('abc', 14)).toBe(14);
    expect(decodeInt('7', 14)).toBe(7);
  });

  it('取值校验拦得住脏字符串', () => {
    expect(isGrade('G1')).toBe(true);
    expect(isGrade('G9')).toBe(false);
    expect(isSource('kugou')).toBe(true);
    expect(isSource('spotify')).toBe(false);
  });
});
