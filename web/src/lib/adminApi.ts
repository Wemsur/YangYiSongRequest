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
