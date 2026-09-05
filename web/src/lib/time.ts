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
