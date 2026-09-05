// 音源账号：网易云走官方扫码登录拿 Cookie（对方站点有 X-Frame-Options，内嵌登录页行不通）。
// QQ 与酷狗台里没有会员，先留手工粘贴 Cookie 的口子；酷狗将来可以走 sidecar 的 /login/qr/*。
import { neteaseApi } from '../sources/netease.js'
import { AppError } from '../lib/errors.js'
import { saveCookie } from './credentials.js'

interface QrKeyBody {
  data?: { unikey?: string }
}

interface QrCreateBody {
  data?: { qrimg?: string; qrurl?: string }
}

interface QrCheckBody {
  code?: number
  message?: string
  cookie?: string
}

export interface QrStart {
  key: string
  /** data:image/png;base64,... 直接塞进 img 的 src */
  qrimg: string
}

export async function neteaseQrStart(): Promise<QrStart> {
  const keyResponse = (await neteaseApi.login_qr_key({})) as { body: QrKeyBody }
  const key = keyResponse.body?.data?.unikey
  if (!key) throw new AppError('QR_FAILED', 502, '网易云没给二维码，稍后再试')

  const created = (await neteaseApi.login_qr_create({ key, qrimg: true })) as { body: QrCreateBody }
  const qrimg = created.body?.data?.qrimg
  if (!qrimg) throw new AppError('QR_FAILED', 502, '二维码生成失败，稍后再试')
  return { key, qrimg }
}

export type QrStatus = 'waiting' | 'scanned' | 'expired' | 'ok'

export interface QrCheck {
  status: QrStatus
  message: string
}

/** 轮询扫码状态；803 表示授权成功，此时把 Cookie 落库 */
export async function neteaseQrCheck(key: string): Promise<QrCheck> {
  const response = (await neteaseApi.login_qr_check({ key })) as { body: QrCheckBody }
  const code = response.body?.code

  if (code === 803) {
    const cookie = response.body?.cookie?.trim()
    if (!cookie) throw new AppError('QR_FAILED', 502, '登录成功但没拿到 Cookie，重来一次')
    await saveCookie('netease', cookie, '扫码登录')
    return { status: 'ok', message: '登录成功，会员音质已可用' }
  }
  if (code === 802) return { status: 'scanned', message: '已扫码，在手机上确认一下' }
  if (code === 801) return { status: 'waiting', message: '等待扫码' }
  return { status: 'expired', message: '二维码过期了，点一下重新生成' }
}
