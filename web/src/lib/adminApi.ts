// 管理端接口。错误处理复用 lib/api.ts 的 apiFetch（统一转成 ApiError）。
import { apiFetch } from './api'
import type { RequestStatus, SourceId } from './api'

export type AdminRole = 'SUPER' | 'REVIEWER'

export interface AdminMe {
  username: string
  role: AdminRole
  mustChangePassword: boolean
}

export interface AdminRequest {
  id: string
  status: RequestStatus
  source: SourceId
  platformId: string
  title: string
  artist: string
  album: string | null
  coverUrl: string | null
  durationMs: number
  vipHint: boolean
  requester: string | null
  flaggedWords: string[]
  isManual: boolean
  rejectReason: string | null
  createdAt: string
  schedule: { playDate: string; slotId: string; slotName: string; orderNo: number } | null
}

export interface AdminDaySlot {
  slotId: string
  slotName: string
  startTime: string
  endTime: string
  maxCount: number | null
  totalMs: number
  songs: AdminRequest[]
}

export interface AuditEntry {
  id: string
  actor: string
  action: string
  targetId: string | null
  detail: unknown
  createdAt: string
}

const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export const adminLogin = (username: string, password: string) =>
  post<AdminMe>('/api/admin/login', { username, password })

export const adminLogout = () => post<{ ok: true }>('/api/admin/logout')

export const adminMe = () => apiFetch<AdminMe | null>('/api/admin/me')

export const changePassword = (current: string, next: string) =>
  post<{ ok: true }>('/api/admin/password', { current, next })

export const listRequests = (params: { status?: string; date?: string; page?: number }) => {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.date) query.set('date', params.date)
  if (params.page) query.set('page', String(params.page))
  return apiFetch<{ total: number; page: number; items: AdminRequest[] }>(
    `/api/admin/requests?${query}`,
  )
}

export const readDay = (date: string) => apiFetch<AdminDaySlot[]>(`/api/admin/schedule/${date}`)

export const scheduleRequest = (id: string, playDate: string, slotId: string) =>
  post<{ orderNo: number; capacity: { over: boolean; message: string | null } }>(
    `/api/admin/requests/${id}/schedule`,
    { playDate, slotId },
  )

export const rejectRequest = (id: string, reason: string) =>
  post<{ ok: true }>(`/api/admin/requests/${id}/reject`, { reason })

export const unscheduleRequest = (id: string) =>
  post<{ ok: true }>(`/api/admin/requests/${id}/unschedule`)

export const batchRequests = (body: {
  ids: string[]
  action: 'schedule' | 'reject'
  playDate?: string
  slotId?: string
  reason?: string
}) =>
  post<{ done: number; failed: Array<{ id: string; message: string }> }>(
    '/api/admin/requests/batch',
    body,
  )

export const reorderSlot = (playDate: string, slotId: string, orderedIds: string[]) =>
  post<{ ok: true }>('/api/admin/schedule/reorder', { playDate, slotId, orderedIds })

export const manualAdd = (body: {
  source: SourceId
  platformId: string
  playDate?: string
  slotId?: string
}) => post<{ id: string; queryCode: string }>('/api/admin/requests/manual', body)

export const listAudit = (page = 1) =>
  apiFetch<{ total: number; page: number; items: AuditEntry[] }>(`/api/admin/audit?page=${page}`)

// ---- 以下只有超管能调（S7 配置）----

export interface SlotRow {
  id?: string
  name: string
  startTime: string
  endTime: string
  maxCount: number | null
  maxMs: number | null
  sortOrder?: number
  enabled: boolean
}

export interface CalendarRow {
  date: string
  kind: 'SCHOOL' | 'OFF' | 'EXAM_NO_BROADCAST'
  note: string | null
}

export interface CredentialRow {
  source: SourceId
  hasCookie: boolean
  updatedAt: string | null
  lastCheckAt: string | null
  lastCheckOk: boolean | null
  note: string | null
}

export interface SourceHealthRow {
  source: SourceId
  label: string
  ok: boolean
  detail: string
  hasCredential: boolean
}

export interface AdminUserRow {
  id: string
  username: string
  role: AdminRole
  disabled: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
}

const put = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) })

export const readSiteConfig = () =>
  apiFetch<{
    requestsOpen: boolean
    requireIdentity: boolean
    announcement: string
    maxScheduleDays: number
  }>('/api/admin/config/site')

export const saveSiteConfig = (body: {
  requestsOpen?: boolean
  requireIdentity?: boolean
  announcement?: string
  maxScheduleDays?: number
}) => put<unknown>('/api/admin/config/site', body)

export const readSlots = () => apiFetch<SlotRow[]>('/api/admin/config/slots')
export const saveSlots = (slots: SlotRow[]) => put<SlotRow[]>('/api/admin/config/slots', { slots })

export const readGrades = () =>
  apiFetch<Array<{ grade: 'G1' | 'G2' | 'G3'; classCount: number }>>('/api/admin/config/grades')
export const saveGrades = (counts: Record<string, number>) =>
  put<unknown>('/api/admin/config/grades', { counts })

export const readWords = () => apiFetch<{ words: string[] }>('/api/admin/config/words')
export const saveWords = (words: string[]) => put<{ words: string[] }>('/api/admin/config/words', { words })

export const readCalendar = (month: string) =>
  apiFetch<CalendarRow[]>(`/api/admin/config/calendar?month=${month}`)
export const saveCalendar = (
  days: Array<{ date: string; kind: CalendarRow['kind'] | null; note?: string }>,
) => put<{ ok: true }>('/api/admin/config/calendar', { days })

export const readCredentials = () =>
  apiFetch<{ keyConfigured: boolean; items: CredentialRow[] }>('/api/admin/sources')
export const checkSources = () => apiFetch<SourceHealthRow[]>('/api/admin/sources/health')
export const startNeteaseQr = () => post<{ key: string; qrimg: string }>('/api/admin/sources/netease/qrcode')
export const checkNeteaseQr = (key: string) =>
  apiFetch<{ status: 'waiting' | 'scanned' | 'expired' | 'ok'; message: string }>(
    `/api/admin/sources/netease/qrcode/check?key=${encodeURIComponent(key)}`,
  )
export const saveSourceCookie = (source: SourceId, cookie: string) =>
  put<unknown>(`/api/admin/sources/${source}/cookie`, { cookie })
export const clearSourceCookie = (source: SourceId) =>
  apiFetch<unknown>(`/api/admin/sources/${source}/cookie`, { method: 'DELETE' })

export const readUsers = () => apiFetch<AdminUserRow[]>('/api/admin/users')
export const createUser = (body: { username: string; password: string; role: AdminRole }) =>
  post<{ id: string }>('/api/admin/users', body)
export const patchUser = (
  id: string,
  body: { disabled?: boolean; role?: AdminRole; password?: string },
) => apiFetch<{ ok: true }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

// 下载类走浏览器直接跳转（cookie 会自动带上），所以这里只给地址不发请求。
// 文件名由后端的 Content-Disposition 决定，前端不掺和。
export const songDownloadUrl = (id: string) => `/api/admin/download/song/${id}`
export const dayZipUrl = (date: string, slotId?: string) =>
  `/api/admin/download/day/${date}${slotId ? `?slotId=${encodeURIComponent(slotId)}` : ''}`
export const dayCsvUrl = (date: string) => `/api/admin/export/day/${date}`
