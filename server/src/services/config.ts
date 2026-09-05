// 超管可改的配置写入口。所有写操作都会顺手清掉对应缓存，改完立刻生效。
import { prisma } from '../lib/db.js'
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

  const existing = await prisma.broadcastSlot.findMany()
  const keep = new Set(slots.map((slot) => slot.id).filter(Boolean))
  const removed = existing.filter((row) => !keep.has(row.id))

  for (const row of removed) {
    const used = await prisma.schedule.count({ where: { slotId: row.id } })
    if (used > 0) {
      throw badRequest('SLOT_IN_USE', `「${row.name}」还排着 ${used} 首歌，先在排期页撤下再删`)
    }
  }

  await prisma.$transaction([
    ...removed.map((row) => prisma.broadcastSlot.delete({ where: { id: row.id } })),
    ...slots.map((slot, index) => {
      const data = {
        name: slot.name.trim(),
        startTime: slot.startTime,
        endTime: slot.endTime,
        maxCount: slot.maxCount ?? null,
        maxMs: slot.maxMs ?? null,
        sortOrder: index,
        enabled: slot.enabled ?? true,
      }
      return slot.id
        ? prisma.broadcastSlot.update({ where: { id: slot.id }, data })
        : prisma.broadcastSlot.create({ data })
    }),
  ])
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
  return prisma.calendarDay.findMany({
    where: { date: { gte: `${month}-01`, lte: `${month}-31` } },
    orderBy: { date: 'asc' },
  })
}

export async function saveCalendar(days: CalendarInput[]): Promise<void> {
  for (const day of days) {
    if (!DATE_RE.test(day.date)) throw badRequest('BAD_DATE', '日期格式不对')
    if (day.kind !== null && !isDayKind(day.kind)) throw badRequest('BAD_KIND', '标记类型不对')
  }
  await prisma.$transaction(
    days.map((day) =>
      day.kind === null
        ? prisma.calendarDay.deleteMany({ where: { date: day.date } })
        : prisma.calendarDay.upsert({
            where: { date: day.date },
            update: { kind: day.kind, note: day.note?.trim() || null },
            create: { date: day.date, kind: day.kind, note: day.note?.trim() || null },
          }),
    ),
  )
}

export async function saveGradeCounts(counts: Record<string, number>): Promise<void> {
  const entries = Object.entries(counts)
  for (const [grade, count] of entries) {
    if (!isGrade(grade)) throw badRequest('BAD_GRADE', '年级不对')
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      throw badRequest('BAD_COUNT', '班数要在 1 到 99 之间')
    }
  }
  await prisma.$transaction(
    entries.map(([grade, classCount]) =>
      prisma.gradeConfig.upsert({
        where: { grade: grade as Grade },
        update: { classCount },
        create: { grade: grade as Grade, classCount },
      }),
    ),
  )
  invalidateSiteCache()
}

/** 整表替换敏感词 */
export async function saveBannedWords(words: string[]): Promise<number> {
  const cleaned = [...new Set(words.map((word) => word.trim()).filter(Boolean))]
  if (cleaned.some((word) => word.length > 30)) throw badRequest('WORD_TOO_LONG', '单个词别超过 30 字')
  await prisma.$transaction([
    prisma.bannedWord.deleteMany({}),
    ...cleaned.map((word) => prisma.bannedWord.create({ data: { word } })),
  ])
  invalidateBannedWords()
  return cleaned.length
}

export async function readBannedWords(): Promise<string[]> {
  const rows = await prisma.bannedWord.findMany({ orderBy: { word: 'asc' } })
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

  await prisma.$transaction(
    updates.map(([key, value]) =>
      prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  )
  invalidateSiteCache()
}

export const ALL_GRADES = GRADES
