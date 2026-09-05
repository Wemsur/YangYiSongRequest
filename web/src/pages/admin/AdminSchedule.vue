<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AdminNav from '@/components/AdminNav.vue'
import { ApiError, SOURCES } from '@/lib/api'
import type { SourceId } from '@/lib/api'
import { readDay, reorderSlot, unscheduleRequest } from '@/lib/adminApi'
import type { AdminDaySlot } from '@/lib/adminApi'
import { duration } from '@/lib/slots'
import { isoDate } from '@/lib/time'
import { usePlayer } from '@/stores/player'

const player = usePlayer()

const date = ref(isoDate(new Date()))
const slots = ref<AdminDaySlot[]>([])
const loading = ref(false)
const failure = ref<string | null>(null)
const notice = ref<string | null>(null)
const dragging = ref<{ slotId: string; index: number } | null>(null)

const sourceLabel = (id: SourceId) => SOURCES.find((item) => item.id === id)?.label ?? id

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    slots.value = await readDay(date.value)
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '读不出来'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(date, () => void load())

/** 把某个时段里的第 from 首移到 to 位，立刻落库 */
async function move(slotId: string, from: number, to: number): Promise<void> {
  const slot = slots.value.find((item) => item.slotId === slotId)
  if (!slot || to < 0 || to >= slot.songs.length || from === to) return
  const list = [...slot.songs]
  const [moved] = list.splice(from, 1)
  if (!moved) return
  list.splice(to, 0, moved)
  slot.songs = list
  notice.value = null
  failure.value = null
  try {
    await reorderSlot(
      date.value,
      slotId,
      list.map((song) => song.id),
    )
    notice.value = '顺序已保存'
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '保存顺序失败'
    await load()
  }
}

async function pull(id: string): Promise<void> {
  try {
    await unscheduleRequest(id)
    notice.value = '已撤下，回到待审核'
    await load()
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '撤下失败'
  }
}

function onDrop(slotId: string, index: number): void {
  const from = dragging.value
  dragging.value = null
  if (!from || from.slotId !== slotId) return
  void move(slotId, from.index, index)
}
</script>

<template>
  <AdminNav />

  <div class="flex flex-wrap items-end justify-between gap-3">
    <label class="block">
      <span class="eyebrow">看哪天</span>
      <input
        v-model="date"
        type="date"
        class="mt-1.5 block rounded-control border border-rule bg-paper px-3 py-2"
      />
    </label>
    <p class="text-sm text-ink-soft">
      拖动或用 ↑ ↓ 调顺序，改完立刻生效，前台歌单同步更新。
    </p>
  </div>

  <p v-if="notice" class="mt-3 text-sm">{{ notice }}</p>
  <p v-if="failure" class="mt-3 text-sm text-orange-deep">{{ failure }}</p>
  <p v-if="loading" class="mt-5 text-sm text-ink-soft">读取中…</p>

  <template v-else>
    <section v-for="slot in slots" :key="slot.slotId" class="paper-card mt-4 overflow-hidden">
    <div class="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
      <div class="flex items-baseline gap-3">
        <span class="font-mono text-sm tabular-nums text-ink-soft">
          {{ slot.startTime }}–{{ slot.endTime }}
        </span>
        <h2 class="text-lg">{{ slot.slotName }}</h2>
      </div>
      <p class="eyebrow">
        {{ slot.songs.length }}<span v-if="slot.maxCount"> / {{ slot.maxCount }}</span> 首 ·
        {{ duration(slot.totalMs) }}
      </p>
    </div>

    <p v-if="slot.songs.length === 0" class="border-t border-rule px-4 py-4 text-sm text-ink-soft">
      这个时段还没排歌。去审核页把待审核的歌排进来。
    </p>

    <ol v-else>
      <li
        v-for="(song, index) in slot.songs"
        :key="song.id"
        class="flex items-center gap-3 border-t border-rule px-4 py-3"
        draggable="true"
        @dragstart="dragging = { slotId: slot.slotId, index }"
        @dragover.prevent
        @drop.prevent="onDrop(slot.slotId, index)"
      >
        <span class="w-5 shrink-0 font-mono text-sm tabular-nums text-ink-faint">
          {{ index + 1 }}
        </span>
        <div class="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            class="rounded-badge border border-rule px-1.5 text-xs disabled:opacity-30"
            :disabled="index === 0"
            :aria-label="`把 ${song.title} 上移`"
            @click="move(slot.slotId, index, index - 1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="rounded-badge border border-rule px-1.5 text-xs disabled:opacity-30"
            :disabled="index === slot.songs.length - 1"
            :aria-label="`把 ${song.title} 下移`"
            @click="move(slot.slotId, index, index + 1)"
          >
            ↓
          </button>
        </div>

        <div class="min-w-0 grow">
          <p class="truncate text-sm">
            {{ song.title }}
            <span v-if="song.status === 'PLAYED'" class="text-ink-faint">· 已播</span>
          </p>
          <p class="truncate text-xs text-ink-soft">
            {{ song.artist }} · {{ sourceLabel(song.source) }} ·
            <span class="font-mono tabular-nums">{{ duration(song.durationMs) }}</span>
            · {{ song.requester }}
          </p>
        </div>

        <button
          type="button"
          class="shrink-0 rounded-control border border-rule px-2.5 py-1.5 text-xs"
          @click="player.toggle(song.source, song.platformId)"
        >
          {{ player.isCurrent(song.source, song.platformId) && player.playing ? '暂停' : '试听' }}
        </button>
        <button
          type="button"
          class="shrink-0 rounded-control border border-rule px-2.5 py-1.5 text-xs"
          @click="pull(song.id)"
        >
          撤下
        </button>
      </li>
    </ol>
  </section>
  </template>
</template>
