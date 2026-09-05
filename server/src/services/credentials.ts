// 音源凭据：Cookie 加密存库，读的时候带 30 秒缓存，免得每次取址都解一遍密。
// 适配层通过注入的 CookieProvider 拿 Cookie，自己不碰数据库（CONTEXT.md 第 3 节）。
import { prisma } from '../lib/db.js'
import { decryptSecret, encryptSecret, hasCredentialKey } from '../lib/crypto.js'
import { SOURCES } from '../lib/domain.js'
import type { SourceId } from '../lib/domain.js'

const TTL_MS = 30_000
const cache = new Map<SourceId, { at: number; cookie: string | null }>()

export function invalidateCredentialCache(source?: SourceId): void {
  if (source) cache.delete(source)
  else cache.clear()
}

/** 注入给音源适配层的 CookieProvider */
export async function readCookie(source: SourceId): Promise<string | null> {
  const hit = cache.get(source)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.cookie

  let cookie: string | null = null
  const row = await prisma.sourceCredential.findUnique({ where: { source } })
  if (row?.encryptedData) {
    try {
      cookie = decryptSecret(row.encryptedData)
    } catch {
      // 解不开就当没配，别让整个音源挂掉；后台「音源账号」页会显示异常
      cookie = null
    }
  }
  cache.set(source, { at: Date.now(), cookie })
  return cookie
}

export async function saveCookie(source: SourceId, cookie: string, note?: string): Promise<void> {
  const trimmed = cookie.trim()
  if (!trimmed) throw new Error('Cookie 是空的')
  const encryptedData = encryptSecret(trimmed)
  await prisma.sourceCredential.upsert({
    where: { source },
    update: { encryptedData, note: note ?? null, lastCheckAt: null, lastCheckOk: null },
    create: { source, encryptedData, note: note ?? null },
  })
  invalidateCredentialCache(source)
}

export async function clearCookie(source: SourceId): Promise<void> {
  await prisma.sourceCredential.deleteMany({ where: { source } })
  invalidateCredentialCache(source)
}

export async function recordCheck(source: SourceId, ok: boolean): Promise<void> {
  await prisma.sourceCredential
    .update({ where: { source }, data: { lastCheckAt: new Date(), lastCheckOk: ok } })
    .catch(() => undefined)
}

export interface CredentialView {
  source: SourceId
  hasCookie: boolean
  updatedAt: string | null
  lastCheckAt: string | null
  lastCheckOk: boolean | null
  note: string | null
}

export async function listCredentials(): Promise<{ keyConfigured: boolean; items: CredentialView[] }> {
  const rows = await prisma.sourceCredential.findMany()
  return {
    keyConfigured: hasCredentialKey(),
    items: SOURCES.map((source) => {
      const row = rows.find((item) => item.source === source)
      return {
        source,
        hasCookie: !!row?.encryptedData,
        updatedAt: row?.updatedAt.toISOString() ?? null,
        lastCheckAt: row?.lastCheckAt?.toISOString() ?? null,
        lastCheckOk: row?.lastCheckOk ?? null,
        note: row?.note ?? null,
      }
    }),
  }
}
