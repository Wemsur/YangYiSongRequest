// 歌单：前台只看得到已排期与已播出的歌，且不含任何点歌人信息（CONTEXT.md 第 6 节）。
import { prisma } from '../lib/db.js'
import { isRequestStatus } from '../lib/domain.js'
import type { RequestStatus, SourceId } from '../lib/domain.js'
import { addDays, shanghaiDate } from '../lib/time.js'

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

const VISIBLE = ['SCHEDULED', 'PLAYED']

interface Row {
  orderNo: number
  playDate: string
  slot: { id: string; name: string; startTime: string; endTime: string }
  request: {
    id: string
    source: string
    platformId: string
    title: string
    artist: string
    coverUrl: string | null
    durationMs: number
    status: string
  }
}

function group(rows: Row[]): PlaylistDay[] {
  const days = new Map<string, Map<string, PlaylistSlot>>()
  for (const row of rows) {
    const slots = days.get(row.playDate) ?? new Map<string, PlaylistSlot>()
    days.set(row.playDate, slots)
    const slot =
      slots.get(row.slot.id) ??
      ({
        slotId: row.slot.id,
        slotName: row.slot.name,
        startTime: row.slot.startTime,
        endTime: row.slot.endTime,
        totalMs: 0,
        songs: [],
      } satisfies PlaylistSlot)
    slots.set(row.slot.id, slot)
    slot.totalMs += row.request.durationMs
    slot.songs.push({
      id: row.request.id,
      source: row.request.source as SourceId,
      platformId: row.request.platformId,
      title: row.request.title,
      artist: row.request.artist,
      coverUrl: row.request.coverUrl,
      durationMs: row.request.durationMs,
      orderNo: row.orderNo,
      status: isRequestStatus(row.request.status) ? row.request.status : 'SCHEDULED',
    })
  }
  return [...days.entries()].map(([date, slots]) => ({ date, slots: [...slots.values()] }))
}

const SELECT = {
  orderNo: true,
  playDate: true,
  slot: { select: { id: true, name: true, startTime: true, endTime: true } },
  request: {
    select: {
      id: true,
      source: true,
      platformId: true,
      title: true,
      artist: true,
      coverUrl: true,
      durationMs: true,
      status: true,
    },
  },
} as const

const ORDER = [
  { playDate: 'asc' },
  { slot: { sortOrder: 'asc' } },
  { orderNo: 'asc' },
] as const

/** 最近歌单：昨天 + 今天 + 未来所有已排期日期（REQUIREMENTS.md 第 3 节） */
export async function readRecent(now: Date = new Date()): Promise<PlaylistDay[]> {
  const rows = await prisma.schedule.findMany({
    where: { playDate: { gte: addDays(shanghaiDate(now), -1) }, request: { status: { in: VISIBLE } } },
    select: SELECT,
    orderBy: [...ORDER],
  })
  return group(rows)
}

export async function readDate(date: string): Promise<PlaylistDay> {
  const rows = await prisma.schedule.findMany({
    where: { playDate: date, request: { status: { in: VISIBLE } } },
    select: SELECT,
    orderBy: [...ORDER],
  })
  return group(rows)[0] ?? { date, slots: [] }
}

/** 过往歌单入口：前天及更早的有歌日期，按月分组倒序（REQUIREMENTS.md 第 3 节） */
export async function listPastMonths(
  now: Date = new Date(),
): Promise<Array<{ month: string; dates: string[] }>> {
  const before = addDays(shanghaiDate(now), -1)
  const rows = await prisma.schedule.findMany({
    where: { playDate: { lt: before }, request: { status: { in: VISIBLE } } },
    select: { playDate: true },
    distinct: ['playDate'],
    orderBy: { playDate: 'desc' },
  })

  const months = new Map<string, string[]>()
  for (const row of rows) {
    const month = row.playDate.slice(0, 7)
    const list = months.get(month) ?? []
    list.push(row.playDate)
    months.set(month, list)
  }
  return [...months.entries()].map(([month, dates]) => ({ month, dates }))
}
