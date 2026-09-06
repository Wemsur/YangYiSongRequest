// 超管可改的配置写入口。所有写操作都会顺手清掉对应缓存，改完立刻生效。
import { and, asc, count, desc, eq, gte, lte, isNull, inArray } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { broadcastSlot, schedule, calendarDay, gradeConfig, bannedWord, siteSetting } from '../drizzle/schema-sqlite.js'
import { GRADES, encodeBool, isDayKind, isGrade } from '../lib/domain.js'
import type { DayKind, Grade } from '../lib/domain.js'
import { badRequest } from '../lib/errors.js'
import { invalidateBannedWords } from './banned-words.js'
import { invalidateSiteCache } from './site.js'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface SlotInput {
  id?: string
  name: string
  startTime: string
  endTime: string
  maxCount?: number | null
  maxMs?: number | null
  enabled?: boolean
}

/** 整表提交：payload 里没有的时段视为删除，被排期引用的不许删 */
export async function saveSlots(slots: SlotInput[]): Promise<void> {
  if (slots.length === 0) throw badRequest('NO_SLOTS', '至少要留一个播出时段')

  for (const slot of slots) {
    const name = slot.name?.trim()
    if (!name) throw badRequest('BAD_SLOT_NAME', '时段名不能为空')
    if (!TIME_RE.test(slot.startTime) || !TIME_RE.test(slot.endTime)) {
      throw badRequest('BAD_TIME', `「${name}」的时间要写成 HH:mm`)
    }
    if (slot.endTime <= slot.startTime) {
      throw badRequest('BAD_RANGE', `「${name}」的结束时间要晚于开始时间`)
    }
  }
  const names = slots.map((slot) => slot.name.trim())
  if (new Set(names).size !== names.length) throw badRequest('DUP_SLOT_NAME', '时段名不能重复')

  const existing: any[] = await (db as any).select().from(broadcastSlot)
  const keep = new Set(slots.map((slot) => slot.id).filter(Boolean))
  const removed = existing.filter((row) => !keep.has(row.id))

  for (const row of removed) {
    const result: any[] = await (db as any)
      .select({ count: count() })
      .from(schedule)
      .where(eq(schedule.slotId, row.id))
    const used = result[0]?.count ?? 0
    if (used > 0) {
      throw badRequest('SLOT_IN_USE', `「${row.name}」还排着 ${used} 首歌，先在排期页撤下再删`)
    }
  }

  await (db as any).transaction(async (tx: any) => {
    // Delete removed slots
    if (removed.length > 0) {
      await tx
        .delete(broadcastSlot)
        .where(inArray(broadcastSlot.id, removed.map((r: any) => r.id)))
    }

    // Upsert slots
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index]!
      const data = {
        name: slot.name.trim(),
        startTime: slot.startTime,
        endTime: slot.endTime,
        maxCount: slot.maxCount ?? null,
        maxMs: slot.maxMs ?? null,
        sortOrder: index,
        enabled: slot.enabled ?? true,
      }

      if (slot.id) {
        // Update existing slot
        await tx.update(broadcastSlot).set(data).where(eq(broadcastSlot.id, slot.id))
      } else {
        // Create new slot with generated ID
        await tx.insert(broadcastSlot).values({
          id: crypto.randomUUID(),
          ...data,
        })
      }
    }
  })
  invalidateSiteCache()
}

export interface CalendarInput {
  date: string
  /** null 表示清掉标记，回到「工作日可播、周末不播」的默认 */
  kind: DayKind | null
  note?: string
}

export async function readCalendar(
  month: string,
): Promise<Array<{ date: string; kind: string; note: string | null }>> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('BAD_MONTH', '月份要写成 YYYY-MM')
  return await (db as any)
    .select()
    .from(calendarDay)
    .where(
      and(
        gte(calendarDay.date, `${month}-01`),
        lte(calendarDay.date, `${month}-31`),
      ),
    )
    .orderBy(asc(calendarDay.date))
}

export async function saveCalendar(days: CalendarInput[]): Promise<void> {
  for (const day of days) {
    if (!DATE_RE.test(day.date)) throw badRequest('BAD_DATE', '日期格式不对')
    if (day.kind !== null && !isDayKind(day.kind)) throw badRequest('BAD_KIND', '标记类型不对')
  }
  
  await (db as any).transaction(async (tx: any) => {
    for (const day of days) {
      if (day.kind === null) {
        // Delete the day
        await tx.delete(calendarDay).where(eq(calendarDay.date, day.date))
      } else {
        // Check if exists, then update or insert
        const existing: any[] = await tx.select().from(calendarDay).where(eq(calendarDay.date, day.date))
        const noteValue = day.note?.trim() || null
        
        if (existing.length > 0) {
          // Update
          await tx
            .update(calendarDay)
            .set({ kind: day.kind, note: noteValue })
            .where(eq(calendarDay.date, day.date))
        } else {
          // Insert
          await tx.insert(calendarDay).values({
            date: day.date,
            kind: day.kind,
            note: noteValue,
          })
        }
      }
    }
  })
}

export async function saveGradeCounts(counts: Record<string, number>): Promise<void> {
  const entries = Object.entries(counts)
  for (const [grade, count] of entries) {
    if (!isGrade(grade)) throw badRequest('BAD_GRADE', '年级不对')
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      throw badRequest('BAD_COUNT', '班数要在 1 到 99 之间')
    }
  }
  
  await (db as any).transaction(async (tx: any) => {
    for (const [grade, classCount] of entries) {
      const existing: any[] = await tx
        .select()
        .from(gradeConfig)
        .where(eq(gradeConfig.grade, grade as Grade))
      
      if (existing.length > 0) {
        // Update
        await tx
          .update(gradeConfig)
          .set({ classCount })
          .where(eq(gradeConfig.grade, grade as Grade))
      } else {
        // Insert
        await tx.insert(gradeConfig).values({
          grade: grade as Grade,
          classCount,
        })
      }
    }
  })
  invalidateSiteCache()
}

/** 整表替换敏感词 */
export async function saveBannedWords(words: string[]): Promise<number> {
  const cleaned = [...new Set(words.map((word) => word.trim()).filter(Boolean))]
  if (cleaned.some((word) => word.length > 30)) throw badRequest('WORD_TOO_LONG', '单个词别超过 30 字')
  
  await (db as any).transaction(async (tx: any) => {
    // Delete all existing banned words
    await tx.delete(bannedWord)
    
    // Insert new banned words
    if (cleaned.length > 0) {
      await tx.insert(bannedWord).values(
        cleaned.map((word) => ({ word })),
      )
    }
  })
  invalidateBannedWords()
  return cleaned.length
}

export async function readBannedWords(): Promise<string[]> {
  const rows: any[] = await (db as any)
    .select()
    .from(bannedWord)
    .orderBy(asc(bannedWord.word))
  return rows.map((row) => row.word)
}

export interface SiteInput {
  requestsOpen?: boolean
  requireIdentity?: boolean
  announcement?: string
  maxScheduleDays?: number
}

export async function saveSiteSettings(input: SiteInput): Promise<void> {
  const updates: Array<[string, string]> = []
  if (input.requestsOpen !== undefined) updates.push(['requestsOpen', encodeBool(input.requestsOpen)])
  if (input.requireIdentity !== undefined) {
    updates.push(['requireIdentity', encodeBool(input.requireIdentity)])
  }
  if (input.announcement !== undefined) {
    if (input.announcement.length > 200) throw badRequest('TOO_LONG', '公告别超过 200 字')
    updates.push(['announcement', input.announcement.trim()])
  }
  if (input.maxScheduleDays !== undefined) {
    if (!Number.isInteger(input.maxScheduleDays) || input.maxScheduleDays < 1 || input.maxScheduleDays > 60) {
      throw badRequest('BAD_DAYS', '最远可排天数要在 1 到 60 之间')
    }
    updates.push(['maxScheduleDays', String(input.maxScheduleDays)])
  }
  if (updates.length === 0) return

  await (db as any).transaction(async (tx: any) => {
    for (const [key, value] of updates) {
      const existing: any[] = await tx
        .select()
        .from(siteSetting)
        .where(eq(siteSetting.key, key))
      
      if (existing.length > 0) {
        // Update
        await tx
          .update(siteSetting)
          .set({ value })
          .where(eq(siteSetting.key, key))
      } else {
        // Insert
        await tx.insert(siteSetting).values({ key, value })
      }
    }
  })
  invalidateSiteCache()
}

export const ALL_GRADES = GRADES
