<script setup lang="ts">
import { computed, ref } from 'vue'
import OnAirLamp from '@/components/OnAirLamp.vue'
import { useServerClock } from '@/stores/clock'
import { activeSlot, FALLBACK_SLOTS } from '@/lib/slots'
import { dateLabel, hhmm } from '@/lib/time'

const SOURCES = ['网易云音乐', 'QQ 音乐', '酷狗音乐']

const clock = useServerClock()
const keyword = ref('')

const now = computed(() => hhmm(clock.serverNow))
const today = computed(() => dateLabel(clock.serverNow))
const current = computed(() => activeSlot(FALLBACK_SLOTS, now.value))
</script>

<template>
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
        v-for="slot in FALLBACK_SLOTS"
        :key="slot.id"
        class="border-t border-rule px-5 py-4 first:border-t-0"
        :class="current?.id === slot.id ? 'bg-orange/10' : ''"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-baseline gap-3">
            <span class="font-mono text-sm tabular-nums text-ink-soft">
              {{ slot.start }}–{{ slot.end }}
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
    <form class="mt-2.5 flex gap-2" @submit.prevent>
      <input
        v-model="keyword"
        type="search"
        placeholder="歌名、歌手，随便打一个"
        class="min-w-0 grow rounded-control border border-rule bg-paper-hi px-4 py-3 text-base placeholder:text-ink-faint"
        aria-label="搜索歌曲"
      />
      <button type="submit" class="btn-primary shrink-0 px-5 py-3">搜索</button>
    </form>
    <div class="mt-3 flex gap-1.5 overflow-x-auto pb-1">
      <span
        v-for="source in SOURCES"
        :key="source"
        class="shrink-0 rounded-badge border border-rule px-3 py-1.5 text-sm text-ink-soft"
      >
        {{ source }}
      </span>
    </div>
    <p class="mt-3 text-sm text-ink-soft">骨架阶段：搜索与试听会在音源适配层完成后接通。</p>
  </section>

  <section class="halftone mt-8 rounded-card border border-rule p-5">
    <p class="eyebrow">点歌规则</p>
    <ul class="mt-3 space-y-2 text-sm">
      <li>填年级、班级、姓名就行，不用注册。播出单上只显示歌，不显示是谁点的。</li>
      <li>每人每天最多点 2 首。</li>
      <li>提交后会拿到一个 6 位查询码，凭它查审核结果，记得存下来。</li>
      <li>审核通过并排好时段的歌才会出现在播出单里。周末和法定假日不播。</li>
    </ul>
  </section>
</template>
