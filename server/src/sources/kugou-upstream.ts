// 酷狗取址走上游 kugoumusicapi 的 sidecar 服务（github:MakcRe/KuGouMusicApi，已作为依赖装进来，
// 用 scripts/start-kugou-api.mjs 起在 127.0.0.1:3300）。它把请求签名、设备注册、扫码登录都封好了，
// 台里以后开了酷狗会员，在后台扫码拿到 Cookie 就能直接出 320k / 无损，不用改这里的代码。
//
// 实测（2026-09-05）：
//   - 上游 /song/url 对免费歌返回完整 128k 地址，付费歌返回空（和直连实现一致，因为没有会员）。
//   - 上游 /search 对匿名请求一律 error_code 152 Parameter Error，所以搜索仍走 kugou.ts 的直连实现。
//   - 首次调用要先 /register/dev 拿设备 cookie，否则签名不过。
import { SourceError } from './types.js'
import type { AudioTarget } from './types.js'

const TIMEOUT_MS = 8000

interface SongUrlBody {
  status?: number
  url?: string[]
  backupUrl?: string[]
  bitRate?: number
  extName?: string
  fileSize?: number
  priv_status?: number
}

/** sidecar 会把设备标识写在 Set-Cookie 里，之后每次请求都要带回去 */
let deviceCookie: string | null = null

async function call<T>(baseUrl: string, path: string, cookie: string | null): Promise<{ body: T; setCookie: string[] }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const merged = [deviceCookie, cookie].filter(Boolean).join('; ')
    const response = await fetch(`${baseUrl}${path}`, {
      headers: merged ? { cookie: merged } : {},
      signal: controller.signal,
    })
    if (!response.ok) throw new SourceError('kugou', `上游服务 HTTP ${response.status}`)
    return { body: (await response.json()) as T, setCookie: response.headers.getSetCookie() }
  } finally {
    clearTimeout(timer)
  }
}

async function ensureDevice(baseUrl: string): Promise<void> {
  if (deviceCookie) return
  const { setCookie } = await call<unknown>(baseUrl, '/register/dev', null)
  const pairs = setCookie.map((item) => item.split(';')[0]).filter(Boolean)
  if (pairs.length > 0) deviceCookie = pairs.join('; ')
}

/**
 * 向 sidecar 要播放地址。拿不到就返回 null，由调用方回落到直连实现。
 * 连不上 sidecar 会抛 SourceError，同样由调用方兜住。
 */
export async function upstreamSongUrl(
  baseUrl: string,
  params: { hash: string; albumId?: string; albumAudioId?: string },
  cookie: string | null,
): Promise<AudioTarget | null> {
  await ensureDevice(baseUrl)
  const query = new URLSearchParams({ hash: params.hash })
  if (params.albumId) query.set('album_id', params.albumId)
  if (params.albumAudioId) query.set('album_audio_id', params.albumAudioId)

  const { body } = await call<SongUrlBody>(baseUrl, `/song/url?${query}`, cookie)
  const url = body.url?.[0] ?? body.backupUrl?.[0]
  if (!url) return null
  return {
    url,
    bitrateKbps: body.bitRate ? Math.round(body.bitRate / 1000) : undefined,
    format: body.extName || 'mp3',
    sizeBytes: body.fileSize || undefined,
    preview: false,
    headers: { referer: 'https://www.kugou.com/' },
  }
}

/** 后台「音源状态」用：确认 sidecar 在线 */
export async function upstreamPing(baseUrl: string): Promise<boolean> {
  try {
    await ensureDevice(baseUrl)
    return deviceCookie !== null
  } catch {
    return false
  }
}

/** 单测用：清掉缓存的设备 cookie */
export function resetUpstreamDevice(): void {
  deviceCookie = null
}
