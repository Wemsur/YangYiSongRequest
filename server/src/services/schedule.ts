// 审核与排期。规则见 REQUIREMENTS.md 第 5 节：
//   - 只能排到行政历允许播出的日期，周末与假日默认不播
//   - 最远 maxScheduleDays 天，不能排到过去
//   - 时段容量超了只提示、不硬拦，最终由管理员判断
// 排期一律追加到末尾，顺序调整走 reorder，这样就不会撞 (playDate, slotId, orderNo) 的唯一约束。
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm'
import type { Database as SQLiteDatabase } from 'better-sqlite3'
import type { Pool } from 'pg'

import { db } from '../lib/db.js'
import { schedule, songRequest, broadcastSlot, calendarDay } from '../drizzle/schema-sqlite.js'
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

  // CONVERSION #1: findUnique -> select().from().where().limit(1)
  const days = await (db as any)
    .select()
    .from(calendarDay)
    .where(eq(calendarDay.date, playDate))
    .limit(1)
  const day = days[0]

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
  // CONVERSION #2: findUnique for broadcastSlot
  const slots = await (db as any)
    .select()
    .from(broadcastSlot)
    .where(eq(broadcastSlot.id, slotId))
    .limit(1)
  const slot = slots[0]

  if (!slot || !slot.enabled) throw badRequest('BAD_SLOT', '时段不对或已停用')

  // CONVERSION #3: findMany with select -> select specific columns with join
  const existing = await (db as any)
    .select({
      durationMs: songRequest.durationMs,
    })
    .from(schedule)
    .innerJoin(songRequest, eq(schedule.requestId, songRequest.id))
    .where(and(eq(schedule.playDate, playDate), eq(schedule.slotId, slotId)))

  const notes: string[] = []
  if (slot.maxCount && existing.length + 1 > slot.maxCount) {
    notes.push(`超过「${slot.name}」${slot.maxCount} 首的上限`)
  }
  const totalMs = existing.reduce((sum: number, row: any) => sum + row.durationMs, 0) + addMs
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
  // CONVERSION #4: findUnique -> select().where().limit(1)
  const requests = await (db as any)
    .select()
    .from(songRequest)
    .where(eq(songRequest.id, requestId))
    .limit(1)
  const request = requests[0]

  if (!request) throw notFound('REQUEST_NOT_FOUND', '这条点歌不存在')
  if (request.status === 'REJECTED') throw badRequest('ALREADY_REJECTED', '这条已经驳回了')

  await assertPlayable(playDate)
  const capacity = await checkCapacity(playDate, slotId, request.durationMs)

  // CONVERSION #5: findMany with select for orderNo
  const existingOrders = await (db as any)
    .select({ orderNo: schedule.orderNo })
    .from(schedule)
    .where(and(eq(schedule.playDate, playDate), eq(schedule.slotId, slotId)))
  const orderNo = nextOrderNo(existingOrders.map((row: any) => row.orderNo))

  // CONVERSION #6: $transaction with upsert/update -> db.transaction()
  await (db as any).transaction(async (tx: any) => {
    // Check if schedule exists for this request
    const existing = await tx
      .select()
      .from(schedule)
      .where(eq(schedule.requestId, requestId))
      .limit(1)

    if (existing.length > 0) {
      // Update existing schedule
      await tx
        .update(schedule)
        .set({ playDate, slotId, orderNo })
        .where(eq(schedule.requestId, requestId))
    } else {
      // Create new schedule
      const scheduleId = `sch_${Math.random().toString(36).slice(2, 11)}`
      await tx.insert(schedule).values({
        id: scheduleId,
        requestId,
        playDate,
        slotId,
        orderNo,
      })
    }

    // Update songRequest status
    await tx
      .update(songRequest)
      .set({
        status: 'SCHEDULED',
        rejectReason: null,
        reviewedAt: new Date(),
        reviewedById: actorId,
      })
      .where(eq(songRequest.id, requestId))
  })

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

  // CONVERSION #7: findUnique -> select().where().limit(1)
  const requests = await (db as any)
    .select()
    .from(songRequest)
    .where(eq(songRequest.id, requestId))
    .limit(1)
  const request = requests[0]

  if (!request) throw notFound('REQUEST_NOT_FOUND', '这条点歌不存在')

  // CONVERSION #8: $transaction with deleteMany/update -> db.transaction()
  await (db as any).transaction(async (tx: any) => {
    // Delete all schedule entries for this request
    await tx.delete(schedule).where(eq(schedule.requestId, requestId))

    // Update songRequest status
    await tx
      .update(songRequest)
      .set({
        status: 'REJECTED',
        rejectReason: trimmed,
        reviewedAt: new Date(),
        reviewedById: actorId,
      })
      .where(eq(songRequest.id, requestId))
  })

  await writeAudit(actorId, 'request.reject', requestId, { reason: trimmed })
}

/** 撤下排期，回到待审核 */
export async function unschedule(actorId: string, requestId: string): Promise<void> {
  // CONVERSION #9: $transaction with deleteMany/update -> db.transaction()
  await (db as any).transaction(async (tx: any) => {
    // Delete all schedule entries for this request
    await tx.delete(schedule).where(eq(schedule.requestId, requestId))

    // Update songRequest status back to PENDING
    await tx
      .update(songRequest)
      .set({ status: 'PENDING', reviewedAt: null, reviewedById: null })
      .where(eq(songRequest.id, requestId))
  })

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
  // CONVERSION #10: findMany with select -> select specific columns
  const rows = await (db as any)
    .select({ id: schedule.id, requestId: schedule.requestId })
    .from(schedule)
    .where(and(eq(schedule.playDate, playDate), eq(schedule.slotId, slotId)))

  const byRequest = new Map(rows.map((row: any) => [row.requestId, row.id]))
  if (
    orderedRequestIds.length !== rows.length ||
    orderedRequestIds.some((id) => !byRequest.has(id))
  ) {
    throw badRequest('BAD_ORDER', '排序列表和这个时段里的歌对不上，刷新一下再试')
  }

  // CONVERSION #11: $transaction callback with multiple updates
  await (db as any).transaction(async (tx: any) => {
    // Step 1: Set all orderNo to negative temporarily to avoid unique constraint
    for (const [index, requestId] of orderedRequestIds.entries()) {
      const scheduleId = byRequest.get(requestId)
      if (scheduleId) {
        await (tx as any)
          .update(schedule)
          .set({ orderNo: -(index + 1) })
          .where((eq as any)(schedule.id, scheduleId))
      }
    }
    // Step 2: Set orderNo to final positive values
    for (const [index, requestId] of orderedRequestIds.entries()) {
      const scheduleId = byRequest.get(requestId)
      if (scheduleId) {
        await (tx as any)
          .update(schedule)
          .set({ orderNo: index + 1 })
          .where((eq as any)(schedule.id, scheduleId))
      }
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

  // CONVERSION #12: create with select -> insert().values().returning()
  const created = await (db as any)
    .insert(songRequest)
    .values({
      id: `req_${Math.random().toString(36).slice(2, 11)}`,
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
    })
    .returning({ id: songRequest.id, queryCode: songRequest.queryCode })

  const result = created[0]

  await writeAudit(actorId, 'request.manual', result.id, { source: song.source, title: song.title })
  if (input.playDate && input.slotId) {
    await scheduleRequest(actorId, result.id, input.playDate, input.slotId)
  }
  return result
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

  // CONVERSION #13: count() with where + findMany with include and complex conditions
  // Using left joins to handle optional schedule and slot relationships
  const [countResult, rows] = await Promise.all([
    (async () => {
      // Count: use different approach based on whether date filter is present
      if (filter.date) {
        const result = await (db as any)
          .select({ count: count() })
          .from(songRequest)
          .innerJoin(schedule, eq(songRequest.id, schedule.requestId))
          .where(eq(schedule.playDate, filter.date))

        return [{ count: result[0]?.count ?? 0 }]
      } else {
        // No date filter, just count songRequests with optional status filter
        let whereClause
        if (isRequestStatus(filter.status)) {
          whereClause = eq(songRequest.status, filter.status)
        }
        const result = await (db as any)
          .select({ count: count() })
          .from(songRequest)
          .where(whereClause)

        return [{ count: result[0]?.count ?? 0 }]
      }
    })(),

    // Retrieve paginated results with relationships
    (async () => {
      let query = (db as any)
        .select({
          id: songRequest.id,
          status: songRequest.status,
          source: songRequest.source,
          platformId: songRequest.platformId,
          title: songRequest.title,
          artist: songRequest.artist,
          album: songRequest.album,
          coverUrl: songRequest.coverUrl,
          durationMs: songRequest.durationMs,
          grade: songRequest.grade,
          classNo: songRequest.classNo,
          requesterName: songRequest.requesterName,
          flaggedWords: songRequest.flaggedWords,
          isManual: songRequest.isManual,
          rejectReason: songRequest.rejectReason,
          createdAt: songRequest.createdAt,
          scheduleId: schedule.id,
          schedulePlayDate: schedule.playDate,
          scheduleSlotId: schedule.slotId,
          scheduleOrderNo: schedule.orderNo,
          slotName: broadcastSlot.name,
        })
        .from(songRequest)
        .leftJoin(schedule, eq(songRequest.id, schedule.requestId))
        .leftJoin(broadcastSlot, eq(schedule.slotId, broadcastSlot.id))

      // Apply filters
      const whereConditions: any[] = []
      if (filter.date) {
        whereConditions.push(eq(schedule.playDate, filter.date))
      } else if (isRequestStatus(filter.status)) {
        whereConditions.push(eq(songRequest.status, filter.status))
      }

      if (whereConditions.length > 0) {
        query = query.where(and(...whereConditions))
      }

      return await query
        .orderBy(desc(songRequest.createdAt))
        .limit(take)
        .offset((page - 1) * take)
    })(),
  ])

  // Transform rows back to AdminRequestView format
  const items = rows.map((row: any) => {
    // Reconstruct the nested structure
    const scheduleData = row.scheduleId
      ? {
          playDate: row.schedulePlayDate,
          slotId: row.scheduleSlotId,
          orderNo: row.scheduleOrderNo,
          slot: { name: row.slotName },
        }
      : null

    return toAdminView({
      id: row.id,
      status: row.status,
      source: row.source,
      platformId: row.platformId,
      title: row.title,
      artist: row.artist,
      album: row.album,
      coverUrl: row.coverUrl,
      durationMs: row.durationMs,
      grade: row.grade,
      classNo: row.classNo,
      requesterName: row.requesterName,
      flaggedWords: row.flaggedWords,
      isManual: row.isManual,
      rejectReason: row.rejectReason,
      createdAt: row.createdAt,
      schedule: scheduleData,
    })
  })

  // Extract count from result
  const total = countResult[0]?.count ?? 0

  return { total, page, items }
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
  // CONVERSION #14: findMany with orderBy (multiple fields) and include
  const [slots, rows] = await Promise.all([
    (db as any)
      .select()
      .from(broadcastSlot)
      .where(eq(broadcastSlot.enabled, 1))
      .orderBy(asc(broadcastSlot.sortOrder), asc(broadcastSlot.startTime)),

    (db as any)
      .select({
        id: songRequest.id,
        status: songRequest.status,
        source: songRequest.source,
        platformId: songRequest.platformId,
        title: songRequest.title,
        artist: songRequest.artist,
        album: songRequest.album,
        coverUrl: songRequest.coverUrl,
        durationMs: songRequest.durationMs,
        grade: songRequest.grade,
        classNo: songRequest.classNo,
        requesterName: songRequest.requesterName,
        flaggedWords: songRequest.flaggedWords,
        isManual: songRequest.isManual,
        rejectReason: songRequest.rejectReason,
        createdAt: songRequest.createdAt,
        schedulePlayDate: schedule.playDate,
        scheduleSlotId: schedule.slotId,
        scheduleOrderNo: schedule.orderNo,
        slotName: broadcastSlot.name,
      })
      .from(songRequest)
      .innerJoin(schedule, eq(songRequest.id, schedule.requestId))
      .innerJoin(broadcastSlot, eq(schedule.slotId, broadcastSlot.id))
      .where(eq(schedule.playDate, date))
      .orderBy(asc(schedule.orderNo)),
  ])

  return slots.map((slot: any) => {
    const songs = rows
      .filter((row: any) => row.scheduleSlotId === slot.id)
      .map((row: any) =>
        toAdminView({
          id: row.id,
          status: row.status,
          source: row.source,
          platformId: row.platformId,
          title: row.title,
          artist: row.artist,
          album: row.album,
          coverUrl: row.coverUrl,
          durationMs: row.durationMs,
          grade: row.grade,
          classNo: row.classNo,
          requesterName: row.requesterName,
          flaggedWords: row.flaggedWords,
          isManual: row.isManual,
          rejectReason: row.rejectReason,
          createdAt: row.createdAt,
          schedule: {
            playDate: row.schedulePlayDate,
            slotId: row.scheduleSlotId,
            orderNo: row.scheduleOrderNo,
            slot: { name: row.slotName },
          },
        }),
      )

    return {
      slotId: slot.id,
      slotName: slot.name,
      startTime: slot.startTime,
      endTime: slot.endTime,
      maxCount: slot.maxCount,
      totalMs: songs.reduce((sum: number, song: AdminRequestView) => sum + song.durationMs, 0),
      songs,
    }
  })
}
