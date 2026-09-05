<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PlaylistCard from '@/components/PlaylistCard.vue'
import { ApiError, fetchPlaylistDate, fetchPlaylistMonths } from '@/lib/api'
import type { PlaylistDay } from '@/lib/api'

const months = ref<Array<{ month: string; dates: string[] }>>([])
const day = ref<PlaylistDay | null>(null)
const active = ref<string | null>(null)
const loading = ref(false)
const failure = ref<string | null>(null)

const monthLabel = (value: string) => `${value.slice(0, 4)} 年 ${Number(value.slice(5, 7))} 月`
const dateLabelShort = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`

async function open(date: string): Promise<void> {
  loading.value = true
  active.value = date
  failure.value = null
  try {
    day.value = await fetchPlaylistDate(date)
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '读不出来'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    months.value = await fetchPlaylistMonths()
    const first = months.value[0]?.dates[0]
    if (first) await open(first)
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '读不出来'
  }
})
</script>

<template>
  <section>
    <p class="eyebrow">过往歌单</p>
    <h1 class="mt-1.5 text-2xl sm:text-3xl">播过的都在这儿</h1>
    <p class="mt-2 text-sm text-ink-soft">
      昨天、今天和之后的安排在
      <RouterLink to="/" class="underline decoration-orange decoration-2 underline-offset-4">
        首页
      </RouterLink>
      。
    </p>

    <p v-if="failure" class="mt-4 text-sm text-orange-deep">{{ failure }}</p>

    <p v-if="months.length === 0 && !failure" class="mt-4 text-sm text-ink-soft">
      还没有播过的歌单。
    </p>

    <div v-for="group in months" :key="group.month" class="mt-5">
      <p class="eyebrow">{{ monthLabel(group.month) }}</p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <button
          v-for="date in group.dates"
          :key="date"
          type="button"
          class="rounded-badge border px-2.5 py-1.5 font-mono text-sm tabular-nums"
          :class="active === date ? 'border-orange bg-orange/15' : 'border-rule text-ink-soft'"
          @click="open(date)"
        >
          {{ dateLabelShort(date) }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="mt-5 text-sm text-ink-soft">读取中…</p>
    <PlaylistCard
      v-else-if="day"
      class="mt-5"
      :date="day.date"
      :slots="day.slots"
      relative="播出单"
    />
  </section>
</template>
