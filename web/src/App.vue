<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import Wordmark from '@/components/Wordmark.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import OnAirLamp from '@/components/OnAirLamp.vue'
import { useServerClock } from '@/stores/clock'
import { useSite } from '@/stores/site'
import { activeSlot } from '@/lib/slots'
import { hhmm } from '@/lib/time'

const clock = useServerClock()
const site = useSite()
onMounted(() => {
  clock.start()
  void site.load()
})

const onAir = computed(() => activeSlot(site.slots, hhmm(clock.serverNow)) !== null)
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-badge focus:bg-paper-hi focus:px-3 focus:py-2"
    >
      跳到主要内容
    </a>

    <header>
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-5 pb-3 sm:px-6">
        <RouterLink to="/" class="flex items-baseline gap-3 rounded-badge">
          <Wordmark class="text-[30px] text-ink sm:text-[38px]" />
          <span class="hidden sm:block">
            <Wordmark variant="full" class="text-[12px] text-ink-soft" />
          </span>
        </RouterLink>
        <div class="flex shrink-0 items-center gap-3">
          <RouterLink
            to="/lookup"
            class="rounded-badge border border-rule px-2.5 py-1.5 text-sm text-ink-soft"
          >
            查询
          </RouterLink>
<!--          <OnAirLamp :on="onAir" />-->
          <ThemeToggle />
        </div>
      </div>
      <div class="mx-auto max-w-5xl px-4 sm:px-6">
        <div class="tick-rule" />
      </div>
    </header>

    <main id="main" class="mx-auto w-full max-w-5xl grow px-4 py-6 sm:px-6 sm:py-9">
      <RouterView />
    </main>

    <footer class="mt-6 border-t border-rule">
      <div
        class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-5 sm:px-6"
      >
        <p class="text-xs text-ink-soft">
          杨村一中校园广播电视台 · 音频来自第三方音乐平台，仅用于校内广播
        </p>
        <p class="eyebrow">
          <span v-if="clock.online === false" class="text-orange-deep">服务未连接</span>
          <span v-else-if="clock.version">v{{ clock.version }}</span>
        </p>
      </div>
    </footer>
  </div>
</template>
