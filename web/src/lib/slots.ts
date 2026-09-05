export interface Slot {
  id: string
  name: string
  startTime: string
  endTime: string
}

/**
 * /api/site 拿不到时的兜底，值与 REQUIREMENTS.md 第 7 节的初始配置一致。
 * 真实时段由超管在后台维护，前台不要写死。
 */
export const FALLBACK_SLOTS: Slot[] = [
  { id: 'noon', name: '午间档', startTime: '12:00', endTime: '12:30' },
  { id: 'evening', name: '晚间档', startTime: '17:40', endTime: '18:00' },
]

/** time 形如 "12:05"；HH:mm 之间直接字符串比较是安全的 */
export function activeSlot<T extends { startTime: string; endTime: string }>(
  slots: readonly T[],
  time: string,
): T | null {
  return slots.find((slot) => time >= slot.startTime && time < slot.endTime) ?? null
}

/** 毫秒转 3:42 这种展示格式 */
export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--'
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
