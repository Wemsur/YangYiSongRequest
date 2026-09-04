/**
 * 三家音源的统一契约。任何实现都不直接碰数据库：需要会员 Cookie 的源通过
 * CookieProvider 注入，这样单测不用起库，将来换实现也只动一个文件。
 */

import { SOURCES } from '../lib/domain.js'
import type { SourceId } from '../lib/domain.js'

// 取值的唯一来源在 lib/domain.ts（数据库里存的就是这些字符串），这里只做转出
export const SOURCE_IDS = SOURCES
export type { SourceId }

export const SOURCE_LABELS: Record<SourceId, string> = {
  netease: '网易云音乐',
  qq: 'QQ 音乐',
  kugou: '酷狗音乐',
}

export interface SongSummary {
  source: SourceId
  /** 音源内部标识：网易云是数字 id，QQ 是 songmid，酷狗是 hash */
  platformId: string
  title: string
  /** 多位歌手用 " / " 连接 */
  artist: string
  album?: string
  durationMs: number
  coverUrl?: string
  /** 该源标为付费或会员专属：前台据此提示，后台据此判断能不能下载 */
  vip: boolean
}

export interface SearchPage {
  source: SourceId
  keyword: string
  page: number
  pageSize: number
  total: number
  songs: SongSummary[]
}

/** 一个可回源的音频地址 */
export interface AudioTarget {
  url: string
  /** 码率 kbps，拿不到时留空 */
  bitrateKbps?: number
  /** mp3 / m4a / flac 等 */
  format?: string
  sizeBytes?: number
  /** true 表示只是试听片段，不是完整曲目 */
  preview: boolean
  /** 回源时必须带上的请求头，主要是 Referer 防盗链 */
  headers?: Record<string, string>
}

export interface SourceHealth {
  ok: boolean
  detail: string
  /** 是否已配置会员 Cookie */
  hasCredential: boolean
}

/** 取该音源的会员 Cookie，没配置返回 null。S7 接后台配置，在那之前恒为 null */
export type CookieProvider = (source: SourceId) => Promise<string | null>

export interface MusicSource {
  readonly id: SourceId
  readonly label: string
  search(keyword: string, page: number, pageSize: number): Promise<SearchPage>
  detail(platformId: string): Promise<SongSummary | null>
  /** 试听地址：够听就行，优先低码率省流量 */
  streamTarget(platformId: string): Promise<AudioTarget | null>
  /** 下载地址：尽可能高音质 */
  downloadTarget(platformId: string): Promise<AudioTarget | null>
  lyric(platformId: string): Promise<string | null>
  health(): Promise<SourceHealth>
}

/** 音源侧的可预期失败。路由层据此只把对应 tab 标成不可用，不影响其他音源。 */
export class SourceError extends Error {
  constructor(
    readonly source: SourceId,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause })
    this.name = 'SourceError'
  }
}

/** 把多位歌手拼成展示用的一行 */
export function joinArtists(names: Array<string | undefined | null>): string {
  const cleaned = names.map((name) => name?.trim()).filter((name): name is string => !!name)
  return cleaned.length > 0 ? cleaned.join(' / ') : '未知歌手'
}
