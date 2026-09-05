// 全站时间一律按东八区展示，不看浏览器所在时区（见 CONTEXT.md 第 6 节）
const TZ = 'Asia/Shanghai'

export function hhmm(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ,
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date)
}

/** YYYY-MM-DD，用于接口参数与文件名 */
export function isoDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * 判断 YYYY-MM-DD 是不是周末。必须按 UTC 解析这个日期字符串再取星期，
 * 写成 `${date}T00:00:00+08:00` 会退到前一天，星期就差一位（服务端 lib/time.ts 同理）。
 */
export function isWeekendDate(date: string): boolean {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  return day === 0 || day === 6
}

/** 在 YYYY-MM-DD 上加减天数，仍返回 YYYY-MM-DD。按 UTC 算，理由同 isWeekendDate */
export function shiftDate(date: string, days: number): string {
  const cursor = new Date(`${date}T00:00:00.000Z`)
  cursor.setUTCDate(cursor.getUTCDate() + days)
  return cursor.toISOString().slice(0, 10)
}

/** 相对今天的口语说法，播出单卡片的标签用它 */
export function relativeDayLabel(date: string, today: string): string {
  const diff = Math.round(
    (Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000,
  )
  if (diff === -1) return '昨天'
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === 2) return '后天'
  const [, month, day] = date.split('-')
  return `${Number(month)}月${Number(day)}日`
}

/** 从今天起找下一个非周末的日期，管理端排期的默认值 */
export function nextWeekday(from: Date = new Date()): string {
  const cursor = new Date(from)
  for (let step = 0; step < 10; step += 1) {
    const date = isoDate(cursor)
    if (!isWeekendDate(date)) return date
    cursor.setDate(cursor.getDate() + 1)
  }
  return isoDate(cursor)
}
