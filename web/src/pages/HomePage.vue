<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import OnAirLamp from '@/components/OnAirLamp.vue'
import RequestSlip from '@/components/RequestSlip.vue'
import SongRow from '@/components/SongRow.vue'
import { ApiError, SOURCES, searchSongs } from '@/lib/api'
import type { Song, SourceId } from '@/lib/api'
import { activeSlot } from '@/lib/slots'
import { dateLabel, hhmm } from '@/lib/time'
import { useServerClock } from '@/stores/clock'
import { usePlayer } from '@/stores/player'
import { useSite } from '@/stores/site'

interface TabState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  songs: Song[]
  total: number
  page: number
  message: string
}

const clock = useServerClock()
const site = useSite()
const player = usePlayer()

const keyword = ref('')
const submitted = ref('')
const active = ref<SourceId>('netease')
const picked = ref<Song | null>(null)

const blank = (): TabState => ({ status: 'idle', songs: [], total: 0, page: 1, message: '' })
const tabs = reactive<Record<SourceId, TabState>>({
  netease: blank(),
  qq: blank(),
  kugou: blank(),
})

const now = computed(() => hhmm(clock.serverNow))
const today = computed(() => dateLabel(clock.serverNow))
const current = computed(() => activeSlot(site.slots, now.value))
const currentTab = computed(() => tabs[active.value])
const searched = computed(() => submitted.value !== '')

onMounted(() => void site.load())

/** 三家各发一次、互不阻塞：一家挂了只影响它自己那个 tab */
async function run(source: SourceId, page: number): Promise<void> {
  const tab = tabs[source]
  tab.status = 'loading'
  tab.message = ''
  try {
    const result = await searchSongs(source, submitted.value, page)
    tab.songs = result.songs
    tab.total = result.total
    tab.page = result.page
    tab.status = 'ready'
  } catch (error) {
    tab.songs = []
    tab.status = 'error'
    tab.message = error instanceof ApiError ? error.message : '搜索失败了'
  }
}

function search(): void {
  const text = keyword.value.trim()
  if (!text) return
  submitted.value = text
  player.stop()
  for (const source of SOURCES) void run(source.id, 1)
}

const pageCount = computed(() => Math.max(1, Math.ceil(currentTab.value.total / 20)))
</script>

<template>
  <p
    v-if="site.announcement"
    class="mb-5 rounded-card border border-yellow px-4 py-3 text-sm"
  >
    {{ site.announcement }}
  </p>

  <section class="paper-card overflow-hidden">
    <div class="flex items-start justify-between gap-3 px-5 pt-4">
      <div>
        <p class="eyebrow">今天的播出单</p>
        <h1 class="mt-1.5 text-2xl sm:text-3xl">{{ today }}</h1>
      </div>
      <p class="mt-0.5 font-mono text-sm tabular-nums text-ink-soft">{{ now }}</p>
    </div>

    <div class="mt-3 px-5">
      <div class="tick-rule" />
    </div>

    <ul>
      <li
        v-for="slot in site.slots"
        :key="slot.id"
        class="border-t border-rule px-5 py-4 first:border-t-0"
        :class="current?.id === slot.id ? 'bg-orange/10' : ''"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-baseline gap-3">
            <span class="font-mono text-sm tabular-nums text-ink-soft">
              {{ slot.startTime }}–{{ slot.endTime }}
            </span>
            <h2 class="text-lg">{{ slot.name }}</h2>
          </div>
          <OnAirLamp v-if="current?.id === slot.id" on />
        </div>
        <p class="mt-2 text-sm text-ink-soft">还没有排歌</p>
      </li>
    </ul>
  </section>

  <section class="mt-8">
    <p class="eyebrow">搜索</p>
    <form class="mt-2.5 flex gap-2" @submit.prevent="search">
      <input
        v-model="keyword"
        type="search"
        placeholder="歌名、歌手，随便打一个"
        class="min-w-0 grow rounded-control border border-rule bg-paper-hi px-4 py-3 text-base placeholder:text-ink-faint"
        aria-label="搜索歌曲"
      />
      <button type="submit" class="btn-primary shrink-0 px-5 py-3">搜索</button>
    </form>

    <div class="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="音源">
      <button
        v-for="source in SOURCES"
        :key="source.id"
        type="button"
        role="tab"
        :aria-selected="active === source.id"
        class="shrink-0 rounded-badge border px-3 py-1.5 text-sm"
        :class="
          active === source.id
            ? 'border-orange bg-orange/15'
            : 'border-rule text-ink-soft'
        "
        @click="active = source.id"
      >
        {{ source.label }}
        <span v-if="searched && tabs[source.id].status === 'ready'" class="font-mono tabular-nums">
          {{ tabs[source.id].total }}
        </span>
        <span v-else-if="searched && tabs[source.id].status === 'error'">·</span>
      </button>
    </div>

    <p v-if="player.error" class="mt-3 text-sm text-orange-deep">{{ player.error }}</p>

    <p v-if="!searched" class="mt-3 text-sm text-ink-soft">
      输入关键词后可以试听，选中的歌点「点歌」提交给台里。
    </p>

    <div v-else class="mt-3">
      <p v-if="currentTab.status === 'loading'" class="text-sm text-ink-soft">搜索中…</p>
      <p v-else-if="currentTab.status === 'error'" class="text-sm text-orange-deep">
        {{ currentTab.message }}
      </p>
      <p v-else-if="currentTab.songs.length === 0" class="text-sm text-ink-soft">
        这个音源没搜到「{{ submitted }}」，换个关键词或切个音源试试。
      </p>
      <template v-else>
        <ul class="paper-card overflow-hidden">
          <SongRow
            v-for="song in currentTab.songs"
            :key="song.platformId"
            :song="song"
            @request="picked = $event"
          />
        </ul>
        <div v-if="pageCount > 1" class="mt-3 flex items-center gap-2">
          <button
            type="button"
            class="rounded-control border border-rule px-3 py-1.5 text-sm disabled:opacity-40"
            :disabled="currentTab.page <= 1"
            @click="run(active, currentTab.page - 1)"
          >
            上一页
          </button>
          <span class="font-mono text-sm tabular-nums text-ink-soft">
            {{ currentTab.page }} / {{ pageCount }}
          </span>
          <button
            type="button"
            class="rounded-control border border-rule px-3 py-1.5 text-sm disabled:opacity-40"
            :disabled="currentTab.page >= pageCount"
            @click="run(active, currentTab.page + 1)"
          >
            下一页
          </button>
        </div>
      </template>
    </div>
  </section>

  <section class="halftone mt-8 rounded-card border border-rule p-5">
    <p class="eyebrow">点歌规则</p>
    <ul class="mt-3 space-y-2 text-sm">
      <li v-if="site.requireIdentity">
        填年级、班级、姓名就行，不用注册。播出单上只显示歌，不显示是谁点的。
      </li>
      <li v-else>现在是匿名点歌，什么都不用填。播出单上只显示歌。</li>
      <li>每人每天最多点 2 首。</li>
      <li>提交后会拿到一个 6 位查询码，凭它查审核结果，记得存下来。</li>
      <li>审核通过并排好时段的歌才会出现在播出单里。周末和法定假日不播。</li>
    </ul>
  </section>

  <RequestSlip :song="picked" @close="picked = null" />
</template>
