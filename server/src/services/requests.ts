// 点歌提交与查询码查询。限流阈值见 REQUIREMENTS.md 第 2 节：
// 同 IP 每天 10 次；同（年级 + 班级 + 姓名）每天 2 首，后者只在「要求填写身份」开启时生效。
import { randomInt } from 'node:crypto'
import { and, count, eq, gte } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { songRequest, schedule, broadcastSlot } from '../drizzle/schema-sqlite.js'
import { GRADE_LABELS, STATUS_LABELS, encodeWordList, isGrade, isRequestStatus } from '../lib/domain.js'
import type { Grade, RequestStatus, SourceId } from '../lib/domain.js'
import { AppError, badRequest, forbidden, notFound, tooMany } from '../lib/errors.js'
import { IDENTITY_DAILY_LIMIT, IP_DAILY_LIMIT } from '../lib/rate-limits.js'
import { shanghaiDayStart } from '../lib/time.js'
import { getSource } from '../sources/index.js'
import { findBannedHits } from './banned-words.js'
import { readSite } from './site.js'

/** 去掉了容易看错的 0 O 1 I L */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export interface SubmitInput {
  source: string
  platformId: string
  grade?: string | null
  classNo?: number | null
  requesterName?: string | null
}

interface Identity {
  grade: Grade
  classNo: number
  requesterName: string
}

function newQueryCode(): string {
  let code = ''
  for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'

export function normalizeIdentity(
  input: SubmitInput,
  required: boolean,
  classCounts: Record<Grade, number>,
): Identity | null {
  const filled =
    input.grade != null || input.classNo != null || (input.requesterName ?? '').trim() !== ''

  if (!required) {
    if (filled) throw badRequest('IDENTITY_NOT_REQUIRED', '现在是匿名点歌，不用填身份')
    return null
  }

  const grade = input.grade
  if (!isGrade(grade)) throw badRequest('BAD_GRADE', '年级没选对')
  const max = classCounts[grade]
  const classNo = Number(input.classNo)
  if (!Number.isInteger(classNo) || classNo < 1 || classNo > max) {
    throw badRequest('BAD_CLASS', `${GRADE_LABELS[grade]}的班级要在 1 到 ${max} 之间`)
  }
  const requesterName = (input.requesterName ?? '').trim()
  if (requesterName.length < 2 || requesterName.length > 12) {
    throw badRequest('BAD_NAME', '姓名填 2 到 12 个字')
  }
  return { grade, classNo, requesterName }
}

export function assertDailyLimits(ipUsed: number, identityUsed: number | null): void {
  if (ipUsed >= IP_DAILY_LIMIT) {
    throw tooMany('RATE_LIMIT_IP', `这台设备今天已经点了 ${IP_DAILY_LIMIT} 次，明天再来`, {
      limit: IP_DAILY_LIMIT,
      window: 'day',
    })
  }
  if (identityUsed !== null && identityUsed >= IDENTITY_DAILY_LIMIT) {
    throw tooMany('RATE_LIMIT_IDENTITY', `每人每天最多点 ${IDENTITY_DAILY_LIMIT} 首，明天再来`, {
      limit: IDENTITY_DAILY_LIMIT,
      window: 'day',
    })
  }
}

export async function submitRequest(input: SubmitInput, ip: string): Promise<{ queryCode: string }> {
  const site = await readSite()
  if (!site.requestsOpen) throw forbidden('REQUESTS_CLOSED', '点歌通道现在关着，等台里再开')

  const source = getSource(input.source)
  if (!source) throw badRequest('BAD_SOURCE', '音源不对')
  if (!input.platformId?.trim()) throw badRequest('BAD_SONG', '没选歌')

  const identity = normalizeIdentity(input, site.requireIdentity, site.classCounts)

  // 歌曲信息一律以音源返回的为准，不信前端传的，免得有人改时长绕过时段上限
  const song = await source.detail(input.platformId.trim())
  if (!song) throw notFound('SONG_NOT_FOUND', '这首歌查不到了，换一首试试')

   const since = shanghaiDayStart()
   const ipCountResult = await (db as any)
     .select({ count: count() })
     .from(songRequest)
     .where(and(eq(songRequest.submitIp, ip), gte(songRequest.createdAt, since)))
   const ipUsed = ipCountResult[0]?.count ?? 0
   
   let identityUsed: number | null = null
   if (identity) {
     const identityCountResult = await (db as any)
       .select({ count: count() })
       .from(songRequest)
       .where(
         and(
           eq(songRequest.grade, identity.grade),
           eq(songRequest.classNo, identity.classNo),
           eq(songRequest.requesterName, identity.requesterName),
           gte(songRequest.createdAt, since),
         ),
       )
     identityUsed = identityCountResult[0]?.count ?? 0
   }
   assertDailyLimits(ipUsed, identityUsed)

  const flagged = await findBannedHits(song.title, song.artist)

   // 查询码是随机的，撞了就换一个再试
   for (let attempt = 0; attempt < 5; attempt += 1) {
     try {
       const created = await (db as any)
         .insert(songRequest)
         .values({
           id: `req_${Math.random().toString(36).slice(2, 11)}`,
           queryCode: newQueryCode(),
           source: song.source,
           platformId: song.platformId,
           title: song.title,
           artist: song.artist,
           album: song.album ?? null,
           durationMs: song.durationMs,
           coverUrl: song.coverUrl ?? null,
           grade: identity?.grade ?? null,
           classNo: identity?.classNo ?? null,
           requesterName: identity?.requesterName ?? null,
           flaggedWords: encodeWordList(flagged),
           submitIp: ip,
         })
         .returning({ queryCode: songRequest.queryCode })
       return { queryCode: created[0].queryCode }
     } catch (error) {
       if (!isUniqueViolation(error)) throw error
     }
   }
   throw new AppError('CODE_COLLISION', 500, '查询码生成失败，再点一次试试')
}

export interface LookupView {
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

/** 凭查询码查单条。刻意不返回任何点歌人信息（见 CONTEXT.md 第 6 节） */
export async function lookupByCode(code: string): Promise<LookupView> {
   const queryCode = code.trim().toUpperCase()
   if (!/^[0-9A-Z]{6}$/.test(queryCode)) throw badRequest('BAD_CODE', '查询码是 6 位字母数字')

   const rows = await (db as any)
     .select({
       id: songRequest.id,
       queryCode: songRequest.queryCode,
       status: songRequest.status,
       source: songRequest.source,
       title: songRequest.title,
       artist: songRequest.artist,
       coverUrl: songRequest.coverUrl,
       durationMs: songRequest.durationMs,
       createdAt: songRequest.createdAt,
       rejectReason: songRequest.rejectReason,
       schedulePlayDate: schedule.playDate,
       scheduleOrderNo: schedule.orderNo,
       slotName: broadcastSlot.name,
     })
     .from(songRequest)
     .leftJoin(schedule, eq(songRequest.id, schedule.requestId))
     .leftJoin(broadcastSlot, eq(schedule.slotId, broadcastSlot.id))
     .where(eq(songRequest.queryCode, queryCode))
     .limit(1)
   
   if (rows.length === 0) throw notFound('CODE_NOT_FOUND', '没找到这个查询码，看看是不是输错了')
   const row = rows[0] as any

   const status = isRequestStatus(row.status) ? (row.status as RequestStatus) : 'PENDING'
   return {
     queryCode: row.queryCode,
     status,
     statusLabel: STATUS_LABELS[status as RequestStatus],
     source: row.source as SourceId,
     title: row.title,
     artist: row.artist,
     coverUrl: row.coverUrl,
     durationMs: row.durationMs,
     createdAt: (row.createdAt as Date).toISOString(),
     rejectReason: row.rejectReason,
     schedule: row.schedulePlayDate
       ? {
           playDate: row.schedulePlayDate,
           slotName: row.slotName,
           orderNo: row.scheduleOrderNo,
         }
       : null,
   }
 }
