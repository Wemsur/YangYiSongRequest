// 站点配置：SiteSetting 是键值表，这里把它读成有类型的对象，并带 30 秒缓存。
// 后台改配置时调 invalidateSiteCache()，不用等缓存过期。
import { prisma } from '../lib/db.js'
import { decodeBool, decodeInt, GRADES } from '../lib/domain.js'
import type { Grade } from '../lib/domain.js'

export interface SiteConfig {
  /** 点歌通道是否开放 */
  requestsOpen: boolean
  /** 是否要求填写年级 / 班级 / 姓名 */
  requireIdentity: boolean
  announcement: string
  maxScheduleDays: number
}

export interface SlotView {
  id: string
  name: string
  startTime: string
  endTime: string
  maxCount: number | null
  maxMs: number | null
}

export interface SiteSnapshot extends SiteConfig {
  slots: SlotView[]
  /** 年级 → 班级数，前台下拉用 */
  classCounts: Record<Grade, number>
}

const DEFAULTS: SiteConfig = {
  requestsOpen: true,
  requireIdentity: true,
  announcement: '',
  maxScheduleDays: 14,
}

const TTL_MS = 30_000
let cache: { at: number; value: SiteSnapshot } | null = null

export function invalidateSiteCache(): void {
  cache = null
}

async function load(): Promise<SiteSnapshot> {
  const [rows, slots, grades] = await Promise.all([
    prisma.siteSetting.findMany(),
    prisma.broadcastSlot.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.gradeConfig.findMany(),
  ])

  const map = new Map(rows.map((row) => [row.key, row.value]))
  const classCounts = Object.fromEntries(
    GRADES.map((grade) => [grade, grades.find((row) => row.grade === grade)?.classCount ?? 23]),
  ) as Record<Grade, number>

  return {
    requestsOpen: decodeBool(map.get('requestsOpen'), DEFAULTS.requestsOpen),
    requireIdentity: decodeBool(map.get('requireIdentity'), DEFAULTS.requireIdentity),
    announcement: map.get('announcement') ?? DEFAULTS.announcement,
    maxScheduleDays: decodeInt(map.get('maxScheduleDays'), DEFAULTS.maxScheduleDays),
    slots: slots.map((slot) => ({
      id: slot.id,
      name: slot.name,
      startTime: slot.startTime,
      endTime: slot.endTime,
      maxCount: slot.maxCount,
      maxMs: slot.maxMs,
    })),
    classCounts,
  }
}

export async function readSite(): Promise<SiteSnapshot> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  const value = await load()
  cache = { at: Date.now(), value }
  return value
}
