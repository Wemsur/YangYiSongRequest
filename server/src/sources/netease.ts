// 网易云音源。直接用 NeteaseCloudMusicApi 这个包（npm 上仍在更新，2026-05 有发布），
// 它把加密协议、扫码登录都封好了，比自己重写划算；S7 的扫码取 Cookie 也用它。
// 实测结论（2026-09-04）：不登录时付费歌只给约 35 秒的 128k 试听片段，
// 台里的会员 Cookie 配上以后才能拿到完整曲目和更高音质。
import { createRequire } from 'node:module'
import type * as NeteaseApi from 'NeteaseCloudMusicApi'
import type { SearchType, SoundQualityType } from 'NeteaseCloudMusicApi'
import { SourceError, joinArtists } from './types.js'
import type {
  AudioTarget,
  CookieProvider,
  MusicSource,
  SearchPage,
  SongSummary,
  SourceHealth,
} from './types.js'

// 这个包是 CJS，而且导出是在运行时动态拼出来的，cjs-module-lexer 认不出来，
// 具名 ESM import 会在加载时直接报 "does not provide an export"。用 createRequire 拿整个
// module.exports，再套上它自带的 interface.d.ts 类型。
const requireCjs = createRequire(import.meta.url)
const netease = requireCjs('NeteaseCloudMusicApi') as typeof NeteaseApi
const { search, song_detail, song_url_v1, lyric: neteaseLyric } = netease

// 这个包把搜索类型和音质等级声明成 const enum，运行时并不存在对应的对象，
// 所以只能按字面量传值再断言，不能 import 成值。
const SEARCH_SINGLE = 1 as unknown as SearchType
const quality = (name: 'standard' | 'exhigh' | 'lossless') => name as unknown as SoundQualityType

/** 试听够听就行；下载从高到低试 */
const STREAM_LEVELS = ['standard'] as const
const DOWNLOAD_LEVELS = ['lossless', 'exhigh', 'standard'] as const

interface SearchSong {
  id: number
  name?: string
  artists?: Array<{ name?: string }>
  album?: { name?: string }
  duration?: number
  fee?: number
}

interface DetailSong {
  id: number
  name?: string
  ar?: Array<{ name?: string }>
  al?: { name?: string; picUrl?: string }
  dt?: number
  fee?: number
}

interface UrlItem {
  id: number
  url?: string | null
  br?: number
  size?: number
  type?: string
  time?: number
}

/** fee：0 免费，1 VIP，4 专辑付费，8 低音质免费 */
const isVip = (fee: number | undefined) => fee === 1 || fee === 4

/** 包里的调用失败会抛各种形状的对象，统一收敛成 SourceError */
async function call<T>(what: string, run: () => Promise<{ body: unknown }>): Promise<T> {
  try {
    const response = await run()
    return response.body as T
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'body' in error
        ? JSON.stringify((error as { body: unknown }).body).slice(0, 200)
        : error instanceof Error
          ? error.message
          : '未知错误'
    throw new SourceError('netease', `${what}失败：${message}`, error)
  }
}

function detailToSummary(song: DetailSong): SongSummary {
  return {
    source: 'netease',
    platformId: String(song.id),
    title: song.name?.trim() ?? '',
    artist: joinArtists((song.ar ?? []).map((artist) => artist.name)),
    album: song.al?.name?.trim() || undefined,
    durationMs: song.dt ?? 0,
    coverUrl: song.al?.picUrl ?? undefined,
    vip: isVip(song.fee),
  }
}

async function fetchDetails(ids: string[], cookie: string | null): Promise<DetailSong[]> {
  if (ids.length === 0) return []
  const body = await call<{ songs?: DetailSong[] }>('取歌曲详情', () =>
    song_detail({ ids: ids.join(','), ...(cookie ? { cookie } : {}) }),
  )
  return body.songs ?? []
}

async function resolveTarget(
  platformId: string,
  levels: readonly ('standard' | 'exhigh' | 'lossless')[],
  cookie: string | null,
): Promise<AudioTarget | null> {
  const [detail] = await fetchDetails([platformId], cookie)
  const fullDurationMs = detail?.dt ?? 0

  for (const level of levels) {
    const body = await call<{ data?: UrlItem[] }>('取播放地址', () =>
      song_url_v1({ id: platformId, level: quality(level), ...(cookie ? { cookie } : {}) }),
    )
    const item = body.data?.[0]
    if (!item?.url) continue
    // 不登录时付费歌只给一段试听，返回的 time 会明显短于真实时长
    const preview = !!item.time && fullDurationMs > 0 && item.time < fullDurationMs * 0.9
    return {
      url: item.url,
      bitrateKbps: item.br ? Math.round(item.br / 1000) : undefined,
      format: item.type?.toLowerCase() || 'mp3',
      sizeBytes: item.size || undefined,
      preview,
    }
  }
  return null
}

export function createNeteaseSource(getCookie: CookieProvider): MusicSource {
  return {
    id: 'netease',
    label: '网易云音乐',

    async search(keyword, page, pageSize): Promise<SearchPage> {
      const cookie = await getCookie('netease')
      const body = await call<{ result?: { songCount?: number; songs?: SearchSong[] } }>(
        '搜索',
        () =>
          search({
            keywords: keyword,
            type: SEARCH_SINGLE,
            limit: pageSize,
            offset: (page - 1) * pageSize,
            ...(cookie ? { cookie } : {}),
          }),
      )
      const found = body.result?.songs ?? []
      // 搜索结果不带封面，补一次详情；补不上就退回搜索里的字段，不让整页失败
      const details = await fetchDetails(
        found.map((song) => String(song.id)),
        cookie,
      ).catch(() => [] as DetailSong[])
      const byId = new Map(details.map((song) => [String(song.id), song]))

      return {
        source: 'netease',
        keyword,
        page,
        pageSize,
        total: body.result?.songCount ?? found.length,
        songs: found.map((song) => {
          const detail = byId.get(String(song.id))
          if (detail) return detailToSummary(detail)
          return {
            source: 'netease' as const,
            platformId: String(song.id),
            title: song.name?.trim() ?? '',
            artist: joinArtists((song.artists ?? []).map((artist) => artist.name)),
            album: song.album?.name?.trim() || undefined,
            durationMs: song.duration ?? 0,
            vip: isVip(song.fee),
          }
        }),
      }
    },

    async detail(platformId) {
      const [song] = await fetchDetails([platformId], await getCookie('netease'))
      return song ? detailToSummary(song) : null
    },

    async streamTarget(platformId) {
      return resolveTarget(platformId, STREAM_LEVELS, await getCookie('netease'))
    },

    async downloadTarget(platformId) {
      return resolveTarget(platformId, DOWNLOAD_LEVELS, await getCookie('netease'))
    },

    async lyric(platformId) {
      const cookie = await getCookie('netease')
      const body = await call<{ lrc?: { lyric?: string } }>('取歌词', () =>
        neteaseLyric({ id: platformId, ...(cookie ? { cookie } : {}) }),
      )
      return body.lrc?.lyric?.trim() || null
    },

    async health(): Promise<SourceHealth> {
      const cookie = await getCookie('netease')
      try {
        const page = await this.search('周杰伦', 1, 1)
        return {
          ok: page.songs.length > 0,
          detail: page.songs.length > 0 ? '搜索正常' : '搜索返回空结果',
          hasCredential: !!cookie,
        }
      } catch (error) {
        return {
          ok: false,
          detail: error instanceof Error ? error.message : '未知错误',
          hasCredential: !!cookie,
        }
      }
    },
  }
}
