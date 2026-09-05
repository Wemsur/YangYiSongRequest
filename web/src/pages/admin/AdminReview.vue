<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AdminNav from '@/components/AdminNav.vue'
import { ApiError, SOURCES } from '@/lib/api'
import type { SourceId } from '@/lib/api'
import {
  batchRequests,
  listRequests,
  rejectRequest,
  scheduleRequest,
  unscheduleRequest,
} from '@/lib/adminApi'
import type { AdminRequest } from '@/lib/adminApi'
import { duration } from '@/lib/slots'
import { nextWeekday } from '@/lib/time'
import { usePlayer } from '@/stores/player'
import { useSite } from '@/stores/site'

const site = useSite()
const player = usePlayer()

const FILTERS = [
  { value: 'PENDING', label: '待审核' },
  { value: 'SCHEDULED', label: '已排期' },
  { value: 'PLAYED', label: '已播出' },
  { value: 'REJECTED', label: '已驳回' },
  { value: '', label: '全部' },
]

const status = ref('PENDING')
const items = ref<AdminRequest[]>([])
const total = ref(0)
const loading = ref(false)
const failure = ref<string | null>(null)
const notice = ref<string | null>(null)
const selected = ref<string[]>([])
const targetSlot = ref('')
const rejectingId = ref<string | null>(null)
const reason = ref('')

/** 默认排到下一个非周末的日期；能不能播最终还是服务端说了算 */
const targetDate = ref(nextWeekday())
const sourceLabel = (id: SourceId) => SOURCES.find((item) => item.id === id)?.label ?? id

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    const result = await listRequests({ status: status.value || undefined })
    items.value = result.items
    total.value = result.total
    selected.value = []
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '列表读不出来'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await site.load()
  targetSlot.value = site.slots[0]?.id ?? ''
  await load()
})

watch(status, () => void load())

async function act(run: () => Promise<string | null>): Promise<void> {
  notice.value = null
  failure.value = null
  try {
    notice.value = await run()
    await load()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '操作失败'
  }
}

const approve = (id: string) =>
  act(async () => {
    const result = await scheduleRequest(id, targetDate.value, targetSlot.value)
    return result.capacity.message ?? `已排到 ${targetDate.value} 第 ${result.orderNo} 首`
  })

const doReject = (id: string) =>
  act(async () => {
    await rejectRequest(id, reason.value)
    rejectingId.value = null
    reason.value = ''
    return '已驳回'
  })

const pull = (id: string) =>
  act(async () => {
    await unscheduleRequest(id)
    return '已撤下，回到待审核'
  })

const runBatch = (action: 'schedule' | 'reject') =>
  act(async () => {
    const result = await batchRequests({
      ids: selected.value,
      action,
      playDate: targetDate.value,
      slotId: targetSlot.value,
      reason: reason.value,
    })
    return `成功 ${result.done} 条${result.failed.length ? `，失败 ${result.failed.length} 条：${result.failed[0]?.message}` : ''}`
  })

const allChecked = computed(
  () => items.value.length > 0 && selected.value.length === items.value.length,
)

function toggleAll(): void {
  selected.value = allChecked.value ? [] : items.value.map((item) => item.id)
}
</script>

<template>
  <AdminNav />

  <div class="flex flex-wrap items-end justify-between gap-3">
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="item in FILTERS"
        :key="item.value"
        type="button"
        class="rounded-badge border px-3 py-1.5 text-sm"
        :class="status === item.value ? 'border-orange bg-orange/15' : 'border-rule text-ink-soft'"
        @click="status = item.value"
      >
        {{ item.label }}
      </button>
    </div>
    <p class="eyebrow">共 {{ total }} 条</p>
  </div>

  <div class="paper-card mt-4 flex flex-wrap items-end gap-3 p-4">
    <label class="block">
      <span class="eyebrow">排到哪天</span>
      <input
        v-model="targetDate"
        type="date"
        class="mt-1.5 block rounded-control border border-rule bg-paper px-3 py-2"
      />
    </label>
    <label class="block">
      <span class="eyebrow">时段</span>
      <select
        v-model="targetSlot"
        class="mt-1.5 block rounded-control border border-rule bg-paper px-3 py-2"
      >
        <option v-for="slot in site.slots" :key="slot.id" :value="slot.id">
          {{ slot.name }} {{ slot.startTime }}–{{ slot.endTime }}
        </option>
      </select>
    </label>
    <div class="flex items-end gap-2">
      <button
        type="button"
        class="btn-primary px-3 py-2 text-sm disabled:opacity-40"
        :disabled="selected.length === 0"
        @click="runBatch('schedule')"
      >
        批量排到这天（{{ selected.length }}）
      </button>
      <button
        type="button"
        class="rounded-control border border-rule px-3 py-2 text-sm disabled:opacity-40"
        :disabled="selected.length === 0 || reason.trim().length < 2"
        @click="runBatch('reject')"
      >
        批量驳回
      </button>
    </div>
    <label class="block grow">
      <span class="eyebrow">驳回理由（批量与单条共用）</span>
      <input
        v-model="reason"
        type="text"
        placeholder="写清楚，学生凭查询码能看到"
        class="mt-1.5 w-full rounded-control border border-rule bg-paper px-3 py-2"
      />
    </label>
  </div>

  <p v-if="notice" class="mt-3 text-sm">{{ notice }}</p>
  <p v-if="failure" class="mt-3 text-sm text-orange-deep">{{ failure }}</p>

  <p v-if="loading" class="mt-5 text-sm text-ink-soft">读取中…</p>
  <p v-else-if="items.length === 0" class="mt-5 text-sm text-ink-soft">这个筛选下没有记录。</p>

  <template v-else>
    <label class="mt-5 flex items-center gap-2 text-sm text-ink-soft">
      <input type="checkbox" :checked="allChecked" @change="toggleAll" />
      全选本页
    </label>

    <ul class="paper-card mt-2 overflow-hidden">
      <li
        v-for="item in items"
        :key="item.id"
        class="border-t border-rule px-4 py-3 first:border-t-0"
      >
        <div class="flex items-start gap-3">
          <input v-model="selected" type="checkbox" :value="item.id" class="mt-1.5 shrink-0" />
          <img
            v-if="item.coverUrl"
            :src="item.coverUrl"
            alt=""
            referrerpolicy="no-referrer"
            loading="lazy"
            class="size-11 shrink-0 rounded-badge border border-rule object-cover"
          />
          <div v-else class="halftone size-11 shrink-0 rounded-badge border border-rule" />

          <div class="min-w-0 grow">
            <p class="truncate">
              {{ item.title }}
              <span v-if="item.flaggedWords.length" class="ml-1 text-orange-deep">
                · 命中敏感词 {{ item.flaggedWords.join('、') }}
              </span>
            </p>
            <p class="truncate text-sm text-ink-soft">
              {{ item.artist }} · {{ sourceLabel(item.source) }} ·
              <span class="font-mono tabular-nums">{{ duration(item.durationMs) }}</span>
              <span v-if="item.vipHint" class="text-orange-deep"> · 可能是付费歌，拿不到完整音频</span>
            </p>
            <p class="mt-0.5 text-xs text-ink-faint">
              {{ item.requester }}
              <span v-if="item.schedule">
                · 已排 {{ item.schedule.playDate }} {{ item.schedule.slotName }} 第
                {{ item.schedule.orderNo }} 首
              </span>
              <span v-if="item.rejectReason"> · 驳回：{{ item.rejectReason }}</span>
            </p>
          </div>

          <div class="flex shrink-0 flex-col items-end gap-1.5">
            <button
              type="button"
              class="rounded-control border border-rule px-2.5 py-1.5 text-xs"
              :class="
                player.isCurrent(item.source, item.platformId) && player.playing
                  ? 'bg-orange/15'
                  : ''
              "
              @click="player.toggle(item.source, item.platformId)"
            >
              {{
                player.isCurrent(item.source, item.platformId) && player.playing ? '暂停' : '试听'
              }}
            </button>
            <button
              v-if="item.status !== 'PLAYED'"
              type="button"
              class="btn-primary px-2.5 py-1.5 text-xs"
              @click="approve(item.id)"
            >
              {{ item.schedule ? '改排到这天' : '通过并排期' }}
            </button>
            <button
              v-if="item.schedule"
              type="button"
              class="rounded-control border border-rule px-2.5 py-1.5 text-xs"
              @click="pull(item.id)"
            >
              撤下
            </button>
            <button
              v-if="item.status !== 'REJECTED'"
              type="button"
              class="rounded-control border border-rule px-2.5 py-1.5 text-xs"
              @click="rejectingId = rejectingId === item.id ? null : item.id"
            >
              驳回
            </button>
          </div>
        </div>

        <div v-if="rejectingId === item.id" class="mt-3 flex flex-wrap items-center gap-2">
          <input
            v-model="reason"
            type="text"
            placeholder="驳回理由"
            class="min-w-0 grow rounded-control border border-rule bg-paper px-3 py-2 text-sm"
          />
          <button
            type="button"
            class="btn-primary px-3 py-2 text-sm disabled:opacity-40"
            :disabled="reason.trim().length < 2"
            @click="doReject(item.id)"
          >
            确认驳回
          </button>
        </div>
      </li>
    </ul>
  </template>
</template>
