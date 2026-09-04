// QQ 音乐音源。实测结论（2026-09-04，见 PROGRESS.md 变更记录）：
//   - 搜索、详情、取址统一走 u.y.qq.com/cgi-bin/musicu.fcg 的 POST 协议；
//     老的 c.y.qq.com/soso/fcgi-bin/client_search_cgi 已经 404，不要再用。
//   - 不登录时：免费歌（pay_play=0）能拿到 M500（128k mp3）与 C400（m4a）；
//     付费歌只剩 RS02 开头的试听片段。M800（320k）和 F000（flac）一律要会员。
//   - 台里没有 QQ 会员，所以下载多半是 128k 或试听片段，后台会如实标注。
import { randomInt } from 'node:crypto'
import { fetchJson } from './http.js'
import { SourceError, joinArtists } from './types.js'
import type {
  AudioTarget,
  CookieProvider,
  MusicSource,
  SearchPage,
  SongSummary,
  SourceHealth,
} from './types.js'

const MUSICU = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const LYRIC_API = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg'
const REFERER = 'https://y.qq.com/'
const COMM = { ct: '19', cv: '1859', uin: '0' }
/** 同一进程内固定即可，QQ 只用它做设备标识 */
const GUID = String(randomInt(100_000_000, 999_999_999))

/** 文件名前缀决定音质，media_mid 才是文件标识 */
const QUALITIES = [
  { prefix: 'F000', ext: 'flac', bitrateKbps: 900, preview: false },
  { prefix: 'M800', ext: 'mp3', bitrateKbps: 320, preview: false },
  { prefix: 'M500', ext: 'mp3', bitrateKbps: 128, preview: false },
  { prefix: 'C400', ext: 'm4a', bitrateKbps: 96, preview: false },
  { prefix: 'RS02', ext: 'mp3', bitrateKbps: 128, preview: true },
] as const

type QualityPrefix = (typeof QUALITIES)[number]['prefix']
/** 试听按低码率优先，省流量；下载按高音质优先 */
const STREAM_ORDER: QualityPrefix[] = ['M500', 'C400', 'RS02']
const DOWNLOAD_ORDER: QualityPrefix[] = ['F000', 'M800', 'M500', 'C400', 'RS02']

interface QQTrack {
  mid: string
  name: string
  singer?: Array<{ name?: string }>
  album?: { mid?: string; name?: string }
  interval?: number
  file?: { media_mid?: string }
  pay?: { pay_play?: number; pay_down?: number }
}

interface VkeyItem {
  filename: string
  purl: string
  result: number
}

/**
 * musicu 的返回是「外层 code + 每个子请求各自的 code」两层。子请求 code 不为 0 时
 * 数据结构照样在，只是全空——实测同 IP 频繁请求会拿到 code 2001 并附一个登录页链接，
 * 所以这里必须显式报错，不能把风控当成「没搜到」。
 */
async function musicu<T>(key: 'req' | 'req_0', payload: unknown, cookie: string | null): Promise<T> {
  const body = await fetchJson<Record<string, { code?: number; data?: T } | undefined>>('qq', MUSICU, {
    method: 'POST',
    body: JSON.stringify(payload),
    cookie,
    headers: { referer: REFERER, 'content-type': 'application/json' },
  })
  const node = body[key]
  if (!node) throw new SourceError('qq', '返回结构异常，缺少子请求结果')
  if (node.code !== 0) {
    throw new SourceError('qq', `接口返回 code=${node.code}，多半是触发风控或需要登录`)
  }
  if (!node.data) throw new SourceError('qq', '返回结构异常，缺少 data')
  return node.data
}

/** 专辑封面按 mid 拼固定地址，QQ 不额外给字段 */
const coverOf = (albumMid: string | undefined) =>
  albumMid ? `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg` : undefined

function toSummary(track: QQTrack): SongSummary {
  return {
    source: 'qq',
    platformId: track.mid,
    title: track.name?.trim() ?? '',
    artist: joinArtists((track.singer ?? []).map((singer) => singer.name)),
    album: track.album?.name?.trim() || undefined,
    durationMs: (track.interval ?? 0) * 1000,
    coverUrl: coverOf(track.album?.mid),
    vip: (track.pay?.pay_play ?? 0) === 1,
  }
}

async function fetchTrack(mid: string, cookie: string | null): Promise<QQTrack | null> {
  const data = await musicu<{ track_info?: QQTrack }>(
    'req',
    {
      comm: COMM,
      req: {
        module: 'music.pf_song_detail_svr',
        method: 'get_song_detail_yqq',
        param: { song_mid: mid, song_type: 0 },
      },
    },
    cookie,
  )
  const track = data.track_info
  return track?.mid ? track : null
}

/**
 * 一次请求把所有候选音质都问一遍，再按偏好顺序挑第一个真的给了地址的。
 * QQ 对拿不到的音质返回空 purl 加一个 result 错误码（104003 = 需要会员）。
 */
async function resolveTarget(
  mid: string,
  order: QualityPrefix[],
  cookie: string | null,
): Promise<AudioTarget | null> {
  const track = await fetchTrack(mid, cookie)
  const mediaMid = track?.file?.media_mid
  if (!mediaMid) return null

  const wanted = QUALITIES.filter((quality) => order.includes(quality.prefix))
  const data = await musicu<{ midurlinfo?: VkeyItem[]; sip?: string[] }>(
    'req_0',
    {
      comm: { uin: '0', format: 'json', ct: 24, cv: 0 },
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid: GUID,
          songmid: wanted.map(() => mid),
          filename: wanted.map((quality) => `${quality.prefix}${mediaMid}.${quality.ext}`),
          songtype: wanted.map(() => 0),
          uin: '0',
          loginflag: 1,
          platform: '20',
        },
      },
    },
    cookie,
  )

  const infos = data.midurlinfo ?? []
  const base = data.sip?.find((host) => host.startsWith('http')) ?? ''
  for (const prefix of order) {
    const quality = QUALITIES.find((item) => item.prefix === prefix)
    if (!quality) continue
    const hit = infos.find((info) => info.filename.startsWith(prefix) && info.purl)
    if (!hit) continue
    return {
      url: base + hit.purl,
      bitrateKbps: quality.bitrateKbps,
      format: quality.ext,
      preview: quality.preview,
      headers: { referer: REFERER },
    }
  }
  return null
}

export function createQQSource(getCookie: CookieProvider): MusicSource {
  return {
    id: 'qq',
    label: 'QQ 音乐',

    async search(keyword, page, pageSize): Promise<SearchPage> {
      const cookie = await getCookie('qq')
      const data = await musicu<{
        meta?: { sum?: number }
        body?: { song?: { list?: QQTrack[] } }
      }>(
        'req',
        {
          comm: COMM,
          req: {
            module: 'music.search.SearchCgiService',
            method: 'DoSearchForQQMusicDesktop',
            param: { query: keyword, num_per_page: pageSize, page_num: page, search_type: 0 },
          },
        },
        cookie,
      )
      const list = data.body?.song?.list ?? []
      return {
        source: 'qq',
        keyword,
        page,
        pageSize,
        total: data.meta?.sum ?? list.length,
        songs: list.filter((track) => track.mid).map(toSummary),
      }
    },

    async detail(platformId) {
      const track = await fetchTrack(platformId, await getCookie('qq'))
      return track ? toSummary(track) : null
    },

    async streamTarget(platformId) {
      return resolveTarget(platformId, STREAM_ORDER, await getCookie('qq'))
    },

    async downloadTarget(platformId) {
      return resolveTarget(platformId, DOWNLOAD_ORDER, await getCookie('qq'))
    },

    async lyric(platformId) {
      const body = await fetchJson<{ lyric?: string }>(
        'qq',
        `${LYRIC_API}?songmid=${platformId}&format=json&nobase64=1&g_tk=5381`,
        { headers: { referer: REFERER } },
      )
      return body.lyric?.trim() || null
    },

    async health(): Promise<SourceHealth> {
      const cookie = await getCookie('qq')
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
