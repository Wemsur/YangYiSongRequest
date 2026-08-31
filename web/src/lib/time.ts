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
