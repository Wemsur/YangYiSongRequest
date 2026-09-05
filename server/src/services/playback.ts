// 「已播出」由时间自动判定，管理员不用手点（REQUIREMENTS.md 第 5 节）。
// 判定规则：排期日期 + 时段结束时间 已经过去，就把 SCHEDULED 翻成 PLAYED。
// 启动时跑一次，之后每 5 分钟跑一次；SQLite 上这是个很小的 update。
import { prisma } from '../lib/db.js'
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

  const pending = await prisma.schedule.findMany({
    where: {
      playDate: { lte: today },
      request: { status: 'SCHEDULED' },
    },
    select: { requestId: true, playDate: true, slot: { select: { endTime: true } } },
  })

  const done = pending
    .filter((row) => isFinished(row.playDate, row.slot.endTime, today, time))
    .map((row) => row.requestId)

  if (done.length === 0) return 0
  const result = await prisma.songRequest.updateMany({
    where: { id: { in: done }, status: 'SCHEDULED' },
    data: { status: 'PLAYED' },
  })
  return result.count
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
