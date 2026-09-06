// 「已播出」由时间自动判定，管理员不用手点（REQUIREMENTS.md 第 5 节）。
// 判定规则：排期日期 + 时段结束时间 已经过去，就把 SCHEDULED 翻成 PLAYED。
// 启动时跑一次，之后每 5 分钟跑一次；这是个很小的 update。
import { eq, lte } from 'drizzle-orm'
import { db, schema } from '../lib/db.js'
import { shanghaiDate, shanghaiTime } from '../lib/time.js'

/** 排期日期已经过去，或者就是今天但时段已经结束 */
export function isFinished(
  playDate: string,
  slotEndTime: string,
  today: string,
  now: string,
): boolean {
  if (playDate < today) return true
  return playDate === today && slotEndTime <= now
}

export async function markPlayed(now: Date = new Date()): Promise<number> {
  const today = shanghaiDate(now)
  const time = shanghaiTime(now)

  const pending = await db
    .select({
      requestId: schema.schedule.requestId,
      playDate: schema.schedule.playDate,
      endTime: schema.broadcastSlot.endTime,
    })
    .from(schema.schedule)
    .innerJoin(schema.songRequest, eq(schema.schedule.requestId, schema.songRequest.id))
    .innerJoin(schema.broadcastSlot, eq(schema.schedule.slotId, schema.broadcastSlot.id))
    .where(lte(schema.schedule.playDate, today))

  const done = pending
    .filter((row: any) => isFinished(row.playDate, row.endTime, today, time))
    .map((row: any) => row.requestId)

  if (done.length === 0) return 0
  
  // Drizzle doesn't have updateMany with 'in', so we update each one
  let count = 0
  for (const id of done) {
    await db.update(schema.songRequest)
      .set({ status: 'PLAYED' })
      .where(eq(schema.songRequest.id, id))
    count++
  }
  return count
}

let timer: NodeJS.Timeout | undefined

export function startPlaybackWatcher(onCount?: (count: number) => void): void {
  const run = () => {
    void markPlayed()
      .then((count) => {
        if (count > 0) onCount?.(count)
      })
      .catch(() => undefined)
  }
  run()
  timer ??= setInterval(run, 5 * 60 * 1000)
  timer.unref?.()
}
