<script setup lang="ts">
import { computed } from 'vue'
import { usePlayer } from '@/stores/player'
import { duration } from '@/lib/slots'
import type { Song } from '@/lib/api'

const props = defineProps<{ song: Song }>()
const emit = defineEmits<{ request: [Song] }>()

const player = usePlayer()
const current = computed(() => player.isCurrent(props.song.source, props.song.platformId))
const busy = computed(() => current.value && player.loading)
const sounding = computed(() => current.value && player.playing)
</script>

<template>
  <li class="flex items-center gap-3 border-t border-rule px-4 py-3 first:border-t-0">
    <img
      v-if="song.coverUrl"
      :src="song.coverUrl"
      alt=""
      referrerpolicy="no-referrer"
      loading="lazy"
      class="size-11 shrink-0 rounded-badge border border-rule object-cover"
    />
    <div v-else class="halftone size-11 shrink-0 rounded-badge border border-rule" />

    <div class="min-w-0 grow">
      <p class="truncate">{{ song.title }}</p>
      <p class="truncate text-sm text-ink-soft">
        <span>{{ song.artist }}</span>
        <span class="font-mono tabular-nums"> · {{ duration(song.durationMs) }}</span>
        <span
          v-if="song.vip"
          class="ml-1.5 rounded-badge border border-yellow px-1.5 py-0.5 text-[11px]"
        >
          会员
        </span>
      </p>
    </div>

    <button
      type="button"
      class="shrink-0 rounded-control border border-rule px-3 py-2 text-sm"
      :class="sounding ? 'bg-orange/15' : ''"
      :aria-label="`试听 ${song.title}`"
      :aria-pressed="sounding"
      @click="player.toggle(song.source, song.platformId)"
    >
      {{ busy ? '载入' : sounding ? '暂停' : '试听' }}
    </button>
    <button
      type="button"
      class="btn-primary shrink-0 px-3 py-2 text-sm"
      :aria-label="`点歌 ${song.title}`"
      @click="emit('request', song)"
    >
      点歌
    </button>
  </li>
</template>
