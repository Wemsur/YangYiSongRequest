export interface Slot {
  id: string
  name: string
  start: string
  end: string
}

/**
 * S2 起改为从 /api/site 读后台配置。这里的默认值与 REQUIREMENTS.md 第 7 节一致，
 * 只是为了让骨架阶段的播出单有东西可渲染。
 */
export const FALLBACK_SLOTS: Slot[] = [
  { id: 'noon', name: '午间档', start: '12:00', end: '12:30' },
  { id: 'evening', name: '晚间档', start: '17:40', end: '18:00' },
]

/** time 形如 "12:05"，字符串比较对 HH:mm 是安全的 */
export function activeSlot(slots: Slot[], time: string): Slot | null {
  return slots.find((slot) => time >= slot.start && time < slot.end) ?? null
}
