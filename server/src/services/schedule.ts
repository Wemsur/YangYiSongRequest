// 审核与排期。规则见 REQUIREMENTS.md 第 5 节：
//   - 只能排到行政历允许播出的日期，周末与假日默认不播
//   - 最远 maxScheduleDays 天，不能排到过去
//   - 时段容量超了只提示、不硬拦，最终由管理员判断
// 排期一律追加到末尾，顺序调整走 reorder，这样就不会撞 (playDate, slotId, orderNo) 的唯一约束。
import { prisma } from '../lib/db.js'
import { decodeWordList, encodeWordList, isRequestStatus } from '../lib/domain.js'
import type { RequestStatus, SourceId } from '../lib/domain.js'
import { badRequest, notFound } from '../lib/errors.js'
import { addDays, isWeekend, shanghaiDate } from '../lib/time.js'
import { getSource } from '../sources/index.js'
import { writeAudit } from './audit.js'
import { findBannedHits } from './banned-words.js'
import { readSite } from './site.js'

export interface CapacityNote {
  over: boolean
  message: string | null
}

/** 这天能不能排。行政历没标记的工作日按可播处理 */
async function assertPlayable(playDate: string): Promise<void> {
  const site = await readSite()
  const today = shanghaiDate()
  assertScheduleDate(playDate, today, site.maxScheduleDays)

  const day = await prisma.calendarDay.findUnique({ where: { date: playDate } })
  if (day) {
    if (day.kind === 'SCHOOL') return
    throw badRequest(
      'DATE_NO_BROADCAST',
      day.kind === 'EXAM_NO_BROADCAST' ? '这天考试，不播' : '这天不上学，不播',
    )
  }
  if (isWeekend(playDate)) throw badRequest('DATE_WEEKEND', '周末不播')
}

export function assertScheduleDate(playDate: string, today: string, maxScheduleDays: number): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playDate)) throw badRequest('BAD_DATE', '日期格式不对')
  if (playDate < today) throw badRequest('DATE_PAST', '不能排到过去的日期')
  if (playDate > addDays(today, maxScheduleDays)) {
    throw badRequest('DATE_TOO_FAR', `最远只能排到 ${maxScheduleDays} 天后`)
  }
}

export function nextOrderNo(orderNumbers: number[]): number {
  return Math.max(0, ...orderNumbers) + 1
}

async function checkCapacity(playDate: string, slotId: string, addMs: number): Promise<CapacityNote> {
  const slot = await prisma.broadcastSlot.findUnique({ where: { id: slotId } })
  if (!slot || !slot.enabled) throw badRequest('BAD_SLOT', '时段不对或已停用')

  const existing = await prisma.schedule.findMany({
    where: { playDate, slotId },
    select: { request: { select: { durationMs: true } } },
  })
  const notes: string[] = []
  if (slot.maxCount && existing.length + 1 > slot.maxCount) {
    notes.push(`超过「${slot.name}」${slot.maxCount} 首的上限`)
  }
  const totalMs = existing.reduce((sum, row) => sum + row.request.durationMs, 0) + addMs
  if (slot.maxMs && totalMs > slot.maxMs) notes.push(`超过「${slot.name}」的总时长上限`)
  return { over: notes.length > 0, message: notes.join('；') || null }
}

/** 通过并排期：追加到该时段末尾 */
export async function scheduleRequest(
  actorId: string,
  requestId: string,
  playDate: string,
  slotId: string,
): Promise<{ orderNo: number; capacity: CapacityNote }> {
  const request = await prisma.songRequest.findUnique({ where: { id: requestId } })
  if (!request) throw notFound('REQUEST_NOT_FOUND', '这条点歌不存在')
  if (request.status === 'REJECTED') throw badRequest('ALREADY_REJECTED', '这条已经驳回了')

  await assertPlayable(playDate)
  const capacity = await checkCapacity(playDate, slotId, request.durationMs)

  const existingOrders = await prisma.schedule.findMany({
    where: { playDate, slotId },
    select: { orderNo: true },
  })
  const orderNo = nextOrderNo(existingOrders.map((row) => row.orderNo))

  await prisma.$transaction([
    prisma.schedule.upsert({
      where: { requestId },
      update: { playDate, slotId, orderNo },
      create: { requestId, playDate, slotId, orderNo },
    }),
    prisma.songRequest.update({
      where: { id: requestId },
      data: {
        status: 'SCHEDULED',
        rejectReason: null,
        reviewedAt: new Date(),
        reviewedById: actorId,
      },
    }),
  ])

  await writeAudit(actorId, 'request.schedule', requestId, { playDate, slotId, orderNo })
  return { orderNo, capacity }
}

export async function rejectRequest(
  actorId: string,
  requestId: string,
  reason: string,
): Promise<void> {
  const trimmed = reason.trim()
  if (trimmed.length < 2) throw badRequest('REASON_REQUIRED', '驳回要写个理由')
  const request = await prisma.songRequest.findUnique({ where: { id: requestId } })
  if (!request) throw notFound('REQUEST_NOT_FOUND', '这条点歌不存在')

  await prisma.$transaction([
    prisma.schedule.deleteMany({ where: { requestId } }),
    prisma.songRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        rejectReason: trimmed,
        reviewedAt: new Date(),
        reviewedById: actorId,
      },
    }),
  ])
  await writeAudit(actorId, 'request.reject', requestId, { reason: trimmed })
}

/** 撤下排期，回到待审核 */
export async function unschedule(actorId: string, requestId: string): Promise<void> {
  await prisma.$transaction([
    prisma.schedule.deleteMany({ where: { requestId } }),
    prisma.songRequest.update({
      where: { id: requestId },
      data: { status: 'PENDING', reviewedAt: null, reviewedById: null },
    }),
  ])
  await writeAudit(actorId, 'schedule.remove', requestId)
}

/**
 * 同时段内重排。先把 orderNo 挪到负数区再落正式值：
 * (playDate, slotId, orderNo) 有唯一约束，一步到位会在中途撞上。
 */
export async function reorderSlot(
  actorId: string,
  playDate: string,
  slotId: string,
  orderedRequestIds: string[],
): Promise<void> {
  const rows = await prisma.schedule.findMany({
    where: { playDate, slotId },
    select: { id: true, requestId: true },
  })
  const byRequest = new Map(rows.map((row) => [row.requestId, row.id]))
  if (
    orderedRequestIds.length !== rows.length ||
    orderedRequestIds.some((id) => !byRequest.has(id))
  ) {
    throw badRequest('BAD_ORDER', '排序列表和这个时段里的歌对不上，刷新一下再试')
  }

  await prisma.$transaction(async (tx) => {
    for (const [index, requestId] of orderedRequestIds.entries()) {
      await tx.schedule.update({
        where: { id: byRequest.get(requestId) },
        data: { orderNo: -(index + 1) },
      })
    }
    for (const [index, requestId] of orderedRequestIds.entries()) {
      await tx.schedule.update({
        where: { id: byRequest.get(requestId) },
        data: { orderNo: index + 1 },
      })
    }
  })
  await writeAudit(actorId, 'schedule.reorder', null, { playDate, slotId, orderedRequestIds })
}

/** 管理员自己搜歌补录，不经点歌流程；给了日期和时段就直接排上 */
export async function manualAdd(
  actorId: string,
  input: { source: string; platformId: string; playDate?: string; slotId?: string },
): Promise<{ id: string; queryCode: string }> {
  const source = getSource(input.source)
  if (!source) throw badRequest('BAD_SOURCE', '音源不对')
  const song = await source.detail(input.platformId)
  if (!song) throw notFound('SONG_NOT_FOUND', '这首歌查不到了')

  const flagged = await findBannedHits(song.title, song.artist)
  const created = await prisma.songRequest.create({
    data: {
      queryCode: `M${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      source: song.source,
      platformId: song.platformId,
      title: song.title,
      artist: song.artist,
      album: song.album ?? null,
      durationMs: song.durationMs,
      coverUrl: song.coverUrl ?? null,
      flaggedWords: encodeWordList(flagged),
      isManual: true,
      submitIp: 'admin',
    },
    select: { id: true, queryCode: true },
  })

  await writeAudit(actorId, 'request.manual', created.id, { source: song.source, title: song.title })
  if (input.playDate && input.slotId) {
    await scheduleRequest(actorId, created.id, input.playDate, input.slotId)
  }
  return created
}

export interface AdminRequestView {
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

const GRADE_TEXT: Record<string, string> = { G1: '高一', G2: '高二', G3: '高三' }

function toAdminView(row: {
  id: string
  status: string
  source: string
  platformId: string
  title: string
  artist: string
  album: string | null
  coverUrl: string | null
  durationMs: number
  grade: string | null
  classNo: number | null
  requesterName: string | null
  flaggedWords: string
  isManual: boolean
  rejectReason: string | null
  createdAt: Date
  schedule: { playDate: string; slotId: string; orderNo: number; slot: { name: string } } | null
}): AdminRequestView {
  return {
    id: row.id,
    status: isRequestStatus(row.status) ? row.status : 'PENDING',
    source: row.source as SourceId,
    platformId: row.platformId,
    title: row.title,
    artist: row.artist,
    album: row.album,
    coverUrl: row.coverUrl,
    durationMs: row.durationMs,
    // 时长为 0 基本就是付费歌拿不到详情，前台已提示过，这里给审核员一个提醒
    vipHint: row.durationMs === 0,
    requester: row.requesterName
      ? `${GRADE_TEXT[row.grade ?? ''] ?? ''}${row.classNo ?? ''}班 ${row.requesterName}`
      : row.isManual
        ? '管理员补录'
        : '匿名',
    flaggedWords: decodeWordList(row.flaggedWords),
    isManual: row.isManual,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt.toISOString(),
    schedule: row.schedule
      ? {
          playDate: row.schedule.playDate,
          slotId: row.schedule.slotId,
          slotName: row.schedule.slot.name,
          orderNo: row.schedule.orderNo,
        }
      : null,
  }
}

export async function listRequests(filter: {
  status?: string
  date?: string
  page?: number
}): Promise<{ total: number; page: number; items: AdminRequestView[] }> {
  const page = Math.max(1, filter.page ?? 1)
  const take = 30
  const where = {
    ...(isRequestStatus(filter.status) ? { status: filter.status } : {}),
    ...(filter.date ? { schedule: { playDate: filter.date } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.songRequest.count({ where }),
    prisma.songRequest.findMany({
      where,
      include: { schedule: { include: { slot: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * take,
      take,
    }),
  ])
  return { total, page, items: rows.map(toAdminView) }
}

/** 某一天的排期总览，管理端排期页用；带点歌人信息 */
export async function readAdminDay(date: string): Promise<
  Array<{
    slotId: string
    slotName: string
    startTime: string
    endTime: string
    maxCount: number | null
    totalMs: number
    songs: AdminRequestView[]
  }>
> {
  const [slots, rows] = await Promise.all([
    prisma.broadcastSlot.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.songRequest.findMany({
      where: { schedule: { playDate: date } },
      include: { schedule: { include: { slot: { select: { name: true } } } } },
      orderBy: { schedule: { orderNo: 'asc' } },
    }),
  ])

  return slots.map((slot) => {
    const songs = rows.filter((row) => row.schedule?.slotId === slot.id).map(toAdminView)
    return {
      slotId: slot.id,
      slotName: slot.name,
      startTime: slot.startTime,
      endTime: slot.endTime,
      maxCount: slot.maxCount,
      totalMs: songs.reduce((sum, song) => sum + song.durationMs, 0),
      songs,
    }
  })
}
