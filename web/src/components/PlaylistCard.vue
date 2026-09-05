<script setup lang="ts">
import { computed } from 'vue'
import OnAirLamp from '@/components/OnAirLamp.vue'
import { SOURCES } from '@/lib/api'
import type { PlaylistSlot, SourceId } from '@/lib/api'
import { duration } from '@/lib/slots'
import { dateLabel } from '@/lib/time'
import { usePlayer } from '@/stores/player'

const props = defineProps<{
  date: string
  slots: PlaylistSlot[]
  /** 「今天」「昨天」这类相对标签，没有就只显示日期 */
  relative?: string
  activeSlotId?: string | null
  /** 今天的播出单用大标题，其余日期用小标题 */
  emphasis?: boolean
}>()

const player = usePlayer()

const heading = computed(() => dateLabel(new Date(`${props.date}T00:00:00+08:00`)))
const sourceLabel = (id: SourceId) => SOURCES.find((item) => item.id === id)?.label ?? id
</script>

<template>
  <section class="paper-card overflow-hidden">
    <div class="flex items-start justify-between gap-3 px-5 pt-4">
      <div>
        <p class="eyebrow">{{ relative ?? '播出单' }}</p>
        <component :is="emphasis ? 'h1' : 'h2'" class="mt-1.5" :class="emphasis ? 'text-2xl sm:text-3xl' : 'text-xl'">
          {{ heading }}
        </component>
      </div>
      <slot name="aside" />
    </div>

    <div class="mt-3 px-5">
      <div class="tick-rule" />
    </div>

    <ul>
      <li
        v-for="slot in slots"
        :key="slot.slotId"
        class="border-t border-rule px-5 py-4 first:border-t-0"
        :class="activeSlotId === slot.slotId ? 'bg-orange/10' : ''"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-baseline gap-3">
            <span class="font-mono text-sm tabular-nums text-ink-soft">
              {{ slot.startTime }}–{{ slot.endTime }}
            </span>
            <h3 class="text-lg">{{ slot.slotName }}</h3>
          </div>
          <OnAirLamp v-if="activeSlotId === slot.slotId" on />
          <span v-else-if="slot.songs.length" class="eyebrow">
            {{ slot.songs.length }} 首 · {{ duration(slot.totalMs) }}
          </span>
        </div>

        <p v-if="slot.songs.length === 0" class="mt-2 text-sm text-ink-soft">还没有排歌</p>
        <ol v-else class="mt-3 space-y-2">
          <li v-for="song in slot.songs" :key="song.id" class="flex items-center gap-3">
            <span class="w-5 shrink-0 font-mono text-sm tabular-nums text-ink-faint">
              {{ song.orderNo }}
            </span>
            <img
              v-if="song.coverUrl"
              :src="song.coverUrl"
              alt=""
              referrerpolicy="no-referrer"
              loading="lazy"
              class="size-9 shrink-0 rounded-badge border border-rule object-cover"
            />
            <div v-else class="halftone size-9 shrink-0 rounded-badge border border-rule" />
            <div class="min-w-0 grow">
              <p class="truncate text-sm">
                {{ song.title }}
                <span v-if="song.status === 'PLAYED'" class="text-ink-faint">· 已播</span>
              </p>
              <p class="truncate text-xs text-ink-soft">
                {{ song.artist }} · {{ sourceLabel(song.source) }} ·
                <span class="font-mono tabular-nums">{{ duration(song.durationMs) }}</span>
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-control border border-rule px-2.5 py-1.5 text-xs"
              :class="player.isCurrent(song.source, song.platformId) && player.playing ? 'bg-orange/15' : ''"
              @click="player.toggle(song.source, song.platformId)"
            >
              {{ player.isCurrent(song.source, song.platformId) && player.playing ? '暂停' : '试听' }}
            </button>
          </li>
        </ol>
      </li>
    </ul>
  </section>
</template>
