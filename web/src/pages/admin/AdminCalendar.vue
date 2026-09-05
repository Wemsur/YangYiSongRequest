<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminNav from '@/components/AdminNav.vue'
import { ApiError } from '@/lib/api'
import { readCalendar, saveCalendar } from '@/lib/adminApi'
import type { CalendarRow } from '@/lib/adminApi'
import { isWeekendDate, isoDate } from '@/lib/time'

type Kind = CalendarRow['kind'] | null

/** 点一下按这个顺序转：默认 → 上学 → 不上学 → 考试不播 → 默认 */
const CYCLE: Kind[] = [null, 'SCHOOL', 'OFF', 'EXAM_NO_BROADCAST']

const LABELS: Record<string, string> = {
  SCHOOL: '上',
  OFF: '休',
  EXAM_NO_BROADCAST: '考',
}

const month = ref(isoDate(new Date()).slice(0, 7))
const marks = ref<Record<string, Kind>>({})
const dirty = ref<string[]>([])
const notice = ref<string | null>(null)
const failure = ref<string | null>(null)

const days = computed(() => {
  const [year, mon] = month.value.split('-').map(Number)
  if (!year || !mon) return []
  const total = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  return Array.from({ length: total }, (_, index) => {
    const date = `${month.value}-${String(index + 1).padStart(2, '0')}`
    return { date, day: index + 1, weekend: isWeekendDate(date) }
  })
})

/** 月初第一天前面要空几格，让列和星期对齐 */
const leading = computed(() => {
  const first = days.value[0]
  if (!first) return 0
  const weekday = new Date(`${first.date}T00:00:00.000Z`).getUTCDay()
  return (weekday + 6) % 7
})

async function load(): Promise<void> {
  failure.value = null
  try {
    const rows = await readCalendar(month.value)
    marks.value = Object.fromEntries(rows.map((row) => [row.date, row.kind]))
    dirty.value = []
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '读不出行政历'
  }
}

onMounted(load)
watch(month, () => void load())

function cycle(date: string): void {
  const current = marks.value[date] ?? null
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length] ?? null
  marks.value = { ...marks.value, [date]: next }
  if (!dirty.value.includes(date)) dirty.value.push(date)
  notice.value = null
}

async function save(): Promise<void> {
  notice.value = null
  failure.value = null
  try {
    await saveCalendar(dirty.value.map((date) => ({ date, kind: marks.value[date] ?? null })))
    notice.value = `已保存 ${dirty.value.length} 天`
    await load()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '保存失败'
  }
}

const cellClass = (date: string, weekend: boolean): string => {
  const kind = marks.value[date] ?? null
  if (kind === 'SCHOOL') return 'border-orange bg-orange/15'
  if (kind === 'EXAM_NO_BROADCAST') return 'border-yellow bg-yellow/15'
  if (kind === 'OFF') return 'border-rule text-ink-faint line-through'
  return weekend ? 'border-rule text-ink-faint' : 'border-rule'
}
</script>

<template>
  <AdminNav />

  <div class="flex flex-wrap items-end justify-between gap-3">
    <label class="block">
      <span class="eyebrow">哪个月</span>
      <input
        v-model="month"
        type="month"
        class="mt-1.5 block rounded-control border border-rule bg-paper px-3 py-2"
      />
    </label>
    <button
      type="button"
      class="btn-primary px-4 py-2 text-sm disabled:opacity-40"
      :disabled="dirty.length === 0"
      @click="save"
    >
      保存改动（{{ dirty.length }}）
    </button>
  </div>

  <p class="mt-3 text-sm text-ink-soft">
    点格子切换：默认 → <span class="text-ink">上</span>（可播）→
    <span class="text-ink">休</span>（不播）→ <span class="text-ink">考</span>（考试不播）→ 默认。
    没标记的日子按「工作日可播、周末不播」处理，所以只有例外才需要标——比如周末补课或考试周。
  </p>

  <p v-if="notice" class="mt-3 text-sm">{{ notice }}</p>
  <p v-if="failure" class="mt-3 text-sm text-orange-deep">{{ failure }}</p>

  <div class="paper-card mt-4 p-4">
    <div class="grid grid-cols-7 gap-1.5 text-center">
      <p v-for="label in ['一', '二', '三', '四', '五', '六', '日']" :key="label" class="eyebrow py-1">
        {{ label }}
      </p>
      <span v-for="blank in leading" :key="`blank-${blank}`" />
      <button
        v-for="item in days"
        :key="item.date"
        type="button"
        class="flex h-14 flex-col items-center justify-center rounded-badge border text-sm"
        :class="cellClass(item.date, item.weekend)"
        @click="cycle(item.date)"
      >
        <span class="font-mono tabular-nums">{{ item.day }}</span>
        <span class="text-xs">{{ LABELS[marks[item.date] ?? ''] ?? (item.weekend ? '休' : '') }}</span>
      </button>
    </div>
  </div>
</template>
