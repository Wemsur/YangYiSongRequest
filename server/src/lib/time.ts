/**
 * 东八区没有夏令时，偏移恒定 +08:00，所以不引 date-fns-tz，直接算。
 * 库里存 UTC，凡是「今天」「某天」这种概念一律经过这里换算（见 CONTEXT.md 第 6 节）。
 */
const OFFSET_MS = 8 * 60 * 60 * 1000

/** YYYY-MM-DD，按东八区。排期日期、行政历、文件名都用这个格式 */
export function shanghaiDate(at: Date = new Date()): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10)
}

/** 东八区当天 00:00 对应的 UTC 时刻，用于「今天以来」的计数 */
export function shanghaiDayStart(at: Date = new Date()): Date {
  return new Date(`${shanghaiDate(at)}T00:00:00.000+08:00`)
}

/** HH:mm，按东八区 */
export function shanghaiTime(at: Date = new Date()): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(11, 16)
}

/** 在 YYYY-MM-DD 上加减天数，仍返回 YYYY-MM-DD */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

/** 周六周日默认不播，行政历没标记时按这个判断 */
export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  return day === 0 || day === 6
}
