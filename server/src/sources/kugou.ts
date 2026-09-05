// 酷狗音源。实测结论（2026-09-04，见 PROGRESS.md 变更记录）：
//   - mobilecdn / msearchcdn 的 TLS 证书 altname 不匹配，只能走 http，所以搜索改用 songsearch（HTTPS 正常）。
//   - 播放地址走移动端 getSongInfo：Privilege 为 0 或 8 的歌能直接拿到 128k 完整地址，
//     Privilege 10 拿不到（付费歌曲）。台里没有酷狗会员，所以不实现高音质，拿不到就在后台标注。
//   - 歌词是两步：krcs 搜候选 → lyrics 下载 base64 的 LRC。
import { fetchJson } from './http.js'
import { joinArtists } from './types.js'
import { resetUpstreamDevice, upstreamPing, upstreamSongUrl } from './kugou-upstream.js'
import { config } from '../config.js'
import type {
  AudioTarget,
  CookieProvider,
  MusicSource,
  SearchPage,
  SongSummary,
  SourceHealth,
} from './types.js'

const SEARCH_API = 'https://songsearch.kugou.com/song_search_v2'
const INFO_API = 'https://m.kugou.com/app/i/getSongInfo.php'
const LYRIC_SEARCH_API = 'https://krcs.kugou.com/search'
const LYRIC_DOWNLOAD_API = 'https://lyrics.kugou.com/download'
const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

interface SearchItem {
  FileHash: string
  SongName: string
  SingerName: string
  AlbumName?: string
  Duration: number
  Privilege: number
  Image?: string
  AlbumImage?: string
}

interface SongInfo {
  status: number
  errcode: number
  songName?: string
  singerName?: string
  choricSinger?: string
  timeLength?: number
  bitRate?: number
  extName?: string
  fileSize?: number
  url?: string
  backup_url?: string[]
  album_img?: string
  privilege?: number
}

/** 搜索结果里的歌名带 <em> 高亮标签 */
const stripTags = (text: string) => text.replace(/<[^>]+>/g, '').trim()

/** 封面地址里的 {size} 占位符要替换成具体尺寸 */
const sizedCover = (url: string | undefined, size = 240) =>
  url ? url.replace('{size}', String(size)) : undefined

/** Privilege 10 表示付费，没有会员就拿不到地址 */
const isPaid = (privilege: number) => privilege === 10

function toSummary(item: SearchItem): SongSummary {
  return {
    source: 'kugou',
    platformId: item.FileHash.toUpperCase(),
    title: stripTags(item.SongName),
    artist: joinArtists([stripTags(item.SingerName ?? '')]),
    album: item.AlbumName?.trim() || undefined,
    durationMs: (item.Duration ?? 0) * 1000,
    coverUrl: sizedCover(item.Image ?? item.AlbumImage),
    vip: isPaid(item.Privilege),
  }
}

async function fetchSearch(keyword: string, page: number, pageSize: number) {
  const query = new URLSearchParams({
    keyword,
    page: String(page),
    pagesize: String(pageSize),
    userid: '0',
    platform: 'WebFilter',
    filter: '2',
    iscorrection: '1',
    privilege_filter: '0',
  })
  return fetchJson<{ status: number; data?: { total?: number; lists?: SearchItem[] } }>(
    'kugou',
    `${SEARCH_API}?${query}`,
    { headers: { referer: 'https://www.kugou.com/' } },
  )
}

async function fetchInfo(hash: string, cookie: string | null = null) {
  return fetchJson<SongInfo>('kugou', `${INFO_API}?cmd=playInfo&hash=${hash}`, {
    headers: { 'user-agent': UA_MOBILE, referer: 'https://m.kugou.com/' },
    cookie,
  })
}

export interface KugouOptions {
  /** 上游 kugoumusicapi 的地址；传空串就只用直连实现（单测走这条） */
  upstreamUrl?: string
}

export function createKugouSource(getCookie: CookieProvider, options: KugouOptions = {}): MusicSource {
  const upstreamUrl = options.upstreamUrl ?? config.kugouApiUrl
  return {
    id: 'kugou',
    label: '酷狗音乐',

    async search(keyword, page, pageSize): Promise<SearchPage> {
      const body = await fetchSearch(keyword, page, pageSize)
      return {
        source: 'kugou',
        keyword,
        page,
        pageSize,
        total: body.data?.total ?? 0,
        songs: (body.data?.lists ?? []).map(toSummary),
      }
    },

    async detail(platformId): Promise<SongSummary | null> {
      const info = await fetchInfo(platformId)
      if (!info.songName) return null
      const title = stripTags(info.songName)
      let durationMs = (info.timeLength ?? 0) * 1000
      let vip = !info.url
      // 付费歌曲的 getSongInfo 把时长和码率一律返回 0，回搜一次把时长补齐
      if (durationMs === 0) {
        const fallback = await fetchSearch(title, 1, 20).catch(() => null)
        const matched = fallback?.data?.lists?.find(
          (item) => item.FileHash.toUpperCase() === platformId.toUpperCase(),
        )
        if (matched) {
          durationMs = (matched.Duration ?? 0) * 1000
          vip = isPaid(matched.Privilege)
        }
      }
      return {
        source: 'kugou',
        platformId: platformId.toUpperCase(),
        title,
        artist: joinArtists([info.choricSinger ?? info.singerName ?? '']),
        durationMs,
        coverUrl: sizedCover(info.album_img),
        vip,
      }
    },

    // 酷狗只有一档 128k，试听和下载走同一个地址；拿不到就是付费歌曲。
    async streamTarget(platformId) {
      return resolveTarget(platformId, await getCookie('kugou'), upstreamUrl)
    },

    async downloadTarget(platformId) {
      return resolveTarget(platformId, await getCookie('kugou'), upstreamUrl)
    },

    async lyric(platformId) {
      const found = await fetchJson<{
        candidates?: Array<{ id: string; accesskey: string }>
      }>('kugou', `${LYRIC_SEARCH_API}?ver=1&man=yes&client=mobi&hash=${platformId}`)
      const candidate = found.candidates?.[0]
      if (!candidate) return null
      const downloaded = await fetchJson<{ content?: string }>(
        'kugou',
        `${LYRIC_DOWNLOAD_API}?ver=1&client=pc&id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&charset=utf8`,
      )
      if (!downloaded.content) return null
      return Buffer.from(downloaded.content, 'base64').toString('utf8')
    },

    async health(): Promise<SourceHealth> {
      const cookie = await getCookie('kugou')
      const upstream = upstreamUrl ? await upstreamPing(upstreamUrl) : null
      const upstreamNote =
        upstream === null ? '' : upstream ? '，上游取址服务在线' : '，上游取址服务离线（已回落直连）'
      try {
        const body = await fetchSearch('周杰伦', 1, 1)
        const ok = body.status === 1 && (body.data?.lists?.length ?? 0) > 0
        return {
          ok,
          detail: `${ok ? '搜索正常' : '搜索返回空结果'}${upstreamNote}`,
          hasCredential: !!cookie,
        }
      } catch (error) {
        return {
          ok: false,
          detail: `${error instanceof Error ? error.message : '未知错误'}${upstreamNote}`,
          hasCredential: !!cookie,
        }
      }
    },
  }
}

/** 上游 sidecar 连不上时的静默期，免得每次取址都白等一次超时 */
let upstreamDownUntil = 0

async function resolveTarget(
  platformId: string,
  cookie: string | null,
  upstreamUrl: string,
): Promise<AudioTarget | null> {
  // 先问上游 kugoumusicapi：它带请求签名，配上会员 Cookie 能出高音质
  if (upstreamUrl && Date.now() >= upstreamDownUntil) {
    try {
      const target = await upstreamSongUrl(upstreamUrl, { hash: platformId }, cookie)
      if (target) return target
    } catch {
      // sidecar 没起或挂了：回落到直连实现，一分钟内不再重试
      upstreamDownUntil = Date.now() + 60_000
      resetUpstreamDevice()
    }
  }

  const info = await fetchInfo(platformId, cookie)
  const url = info.url || info.backup_url?.[0]
  if (!url) return null
  return {
    url,
    bitrateKbps: info.bitRate || undefined,
    format: info.extName || 'mp3',
    sizeBytes: info.fileSize || undefined,
    preview: false,
    headers: { referer: 'https://m.kugou.com/', ...(cookie ? { cookie } : {}) },
  }
}
