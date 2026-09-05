// 后端接口的唯一入口。契约见 API.md。
// 约定：后端所有错误都是 { error: { code, message } }，message 是可以直接显示给学生的中文。

export type SourceId = 'netease' | 'qq' | 'kugou'
export type Grade = 'G1' | 'G2' | 'G3'
export type RequestStatus = 'PENDING' | 'SCHEDULED' | 'PLAYED' | 'REJECTED'

export const SOURCES: Array<{ id: SourceId; label: string }> = [
  { id: 'netease', label: '网易云音乐' },
  { id: 'qq', label: 'QQ 音乐' },
  { id: 'kugou', label: '酷狗音乐' },
]

export const GRADE_OPTIONS: Array<{ value: Grade; label: string }> = [
  { value: 'G1', label: '高一' },
  { value: 'G2', label: '高二' },
  { value: 'G3', label: '高三' },
]

export interface ServerInfo {
  version: string
  serverTime: string
}

export interface Song {
  source: SourceId
  platformId: string
  title: string
  artist: string
  album?: string
  durationMs: number
  coverUrl?: string
  vip: boolean
}

export interface SearchPage {
  source: SourceId
  keyword: string
  page: number
  pageSize: number
  total: number
  songs: Song[]
}

export interface SlotView {
  id: string
  name: string
  startTime: string
  endTime: string
  maxCount: number | null
  maxMs: number | null
}

export interface SiteSnapshot {
  requestsOpen: boolean
  requireIdentity: boolean
  announcement: string
  maxScheduleDays: number
  slots: SlotView[]
  classCounts: Record<Grade, number>
}

export interface LookupResult {
  queryCode: string
  status: RequestStatus
  statusLabel: string
  source: SourceId
  title: string
  artist: string
  coverUrl: string | null
  durationMs: number
  createdAt: string
  rejectReason: string | null
  schedule: { playDate: string; slotName: string; orderNo: number } | null
}

export interface PlaylistSong {
  id: string
  source: SourceId
  platformId: string
  title: string
  artist: string
  coverUrl: string | null
  durationMs: number
  orderNo: number
  status: RequestStatus
}

export interface PlaylistSlot {
  slotId: string
  slotName: string
  startTime: string
  endTime: string
  totalMs: number
  songs: PlaylistSong[]
}

export interface PlaylistDay {
  date: string
  slots: PlaylistSlot[]
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 管理端的请求也复用这套错误处理，见 lib/adminApi.ts */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('NETWORK', '连不上服务器，检查一下网络', 0)
  }

  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!response.ok) {
    const payload = data as { error?: { code?: string; message?: string } } | null
    throw new ApiError(
      payload?.error?.code ?? 'UNKNOWN',
      payload?.error?.message ?? `服务返回 ${response.status}`,
      response.status,
    )
  }
  return data as T
}

export const fetchServerInfo = () => apiFetch<ServerInfo>('/api/version')

export const fetchSite = () => apiFetch<SiteSnapshot>('/api/site')

export const searchSongs = (source: SourceId, keyword: string, page = 1) =>
  apiFetch<SearchPage>(
    `/api/search?source=${source}&q=${encodeURIComponent(keyword)}&page=${page}`,
  )

export interface SubmitBody {
  source: SourceId
  platformId: string
  grade?: Grade
  classNo?: number
  requesterName?: string
}

export const submitRequest = (body: SubmitBody) =>
  apiFetch<{ queryCode: string }>('/api/requests', { method: 'POST', body: JSON.stringify(body) })

export const lookupRequest = (code: string) =>
  apiFetch<LookupResult>(`/api/requests/${encodeURIComponent(code.trim().toUpperCase())}`)

/** 试听走后端代理，前台拿不到平台直链 */
export const streamUrl = (source: SourceId, platformId: string) =>
  `/api/stream/${source}/${encodeURIComponent(platformId)}`

export const fetchRecentPlaylist = () => apiFetch<PlaylistDay[]>('/api/playlist/recent')

export const fetchPlaylistMonths = () =>
  apiFetch<Array<{ month: string; dates: string[] }>>('/api/playlist/months')

export const fetchPlaylistDate = (date: string) =>
  apiFetch<PlaylistDay>(`/api/playlist/date/${date}`)
