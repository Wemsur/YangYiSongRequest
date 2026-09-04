/**
 * SQLite 存不了原生 enum、数组和 Json，这些取值只能落成字符串。
 * 本文件是唯一的取值来源：联合类型管编译期，常量数组和 is* 函数管运行期，
 * 顺带放几个「压平字段」的编解码函数，避免各处自己 JSON.parse。
 */

export const SOURCES = ['netease', 'qq', 'kugou'] as const
export type SourceId = (typeof SOURCES)[number]

export const GRADES = ['G1', 'G2', 'G3'] as const
export type Grade = (typeof GRADES)[number]
export const GRADE_LABELS: Record<Grade, string> = { G1: '高一', G2: '高二', G3: '高三' }

export const REQUEST_STATUSES = ['PENDING', 'SCHEDULED', 'PLAYED', 'REJECTED'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]
export const STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: '待审核',
  SCHEDULED: '已排期',
  PLAYED: '已播出',
  REJECTED: '已驳回',
}

export const DAY_KINDS = ['SCHOOL', 'OFF', 'EXAM_NO_BROADCAST'] as const
export type DayKind = (typeof DAY_KINDS)[number]
export const DAY_KIND_LABELS: Record<DayKind, string> = {
  SCHOOL: '上学',
  OFF: '不上学',
  EXAM_NO_BROADCAST: '考试不播',
}

export const ADMIN_ROLES = ['SUPER', 'REVIEWER'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]
export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER: '超级管理员',
  REVIEWER: '审核员',
}

const membership =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (values as readonly string[]).includes(value)

export const isSource = membership(SOURCES)
export const isGrade = membership(GRADES)
export const isRequestStatus = membership(REQUEST_STATUSES)
export const isDayKind = membership(DAY_KINDS)
export const isAdminRole = membership(ADMIN_ROLES)

/** SongRequest.flaggedWords 存的是 JSON 数组字符串 */
export function decodeWordList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function encodeWordList(words: readonly string[]): string {
  return JSON.stringify([...new Set(words.map((word) => word.trim()).filter(Boolean))])
}

/** AuditLog.detail 存的是 JSON 字符串，坏数据不该把日志页面搞崩 */
export function decodeDetail(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return { raw }
  }
}

export function encodeDetail(detail: unknown): string | null {
  return detail === undefined || detail === null ? null : JSON.stringify(detail)
}

/** SiteSetting 的值也是字符串，布尔与整数在这里统一口径 */
export const decodeBool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value === 'true'

export const encodeBool = (value: boolean): string => (value ? 'true' : 'false')

export const decodeInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
