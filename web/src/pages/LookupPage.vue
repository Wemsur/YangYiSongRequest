<script setup lang="ts">
import { computed, ref } from 'vue'
import { ApiError, lookupRequest } from '@/lib/api'
import type { LookupResult } from '@/lib/api'
import { duration } from '@/lib/slots'

const code = ref('')
const result = ref<LookupResult | null>(null)
const failure = ref<string | null>(null)
const loading = ref(false)

const accent = computed(() => {
  switch (result.value?.status) {
    case 'SCHEDULED':
      return 'border-orange'
    case 'REJECTED':
      return 'border-orange-deep'
    default:
      return 'border-rule'
  }
})

async function look(): Promise<void> {
  const value = code.value.trim()
  if (!value || loading.value) return
  loading.value = true
  failure.value = null
  result.value = null
  try {
    result.value = await lookupRequest(value)
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '查询失败了'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section>
    <p class="eyebrow">查询点歌</p>
    <h1 class="mt-1.5 text-2xl sm:text-3xl">凭查询码看审核结果</h1>
    <p class="mt-2 text-sm text-ink-soft">
      提交点歌时给的那 6 位码，字母不分大小写。
    </p>

    <form class="mt-4 flex gap-2" @submit.prevent="look">
      <input
        v-model="code"
        type="text"
        maxlength="6"
        autocapitalize="characters"
        placeholder="例如 RUS5YP"
        class="min-w-0 grow rounded-control border border-rule bg-paper-hi px-4 py-3 font-mono text-lg tracking-[0.18em] uppercase placeholder:text-ink-faint placeholder:tracking-normal"
        aria-label="查询码"
      />
      <button type="submit" class="btn-primary shrink-0 px-5 py-3" :disabled="loading">
        {{ loading ? '查询中' : '查询' }}
      </button>
    </form>

    <p v-if="failure" class="mt-3 text-sm text-orange-deep">{{ failure }}</p>

    <div v-if="result" class="paper-card mt-5 border-l-4 p-5" :class="accent">
      <div class="flex items-start gap-3">
        <img
          v-if="result.coverUrl"
          :src="result.coverUrl"
          alt=""
          referrerpolicy="no-referrer"
          class="size-14 shrink-0 rounded-badge border border-rule object-cover"
        />
        <div class="min-w-0">
          <p class="eyebrow">{{ result.statusLabel }}</p>
          <h2 class="mt-1 truncate text-xl">{{ result.title }}</h2>
          <p class="mt-1 truncate text-sm text-ink-soft">
            {{ result.artist }}
            <span class="font-mono tabular-nums"> · {{ duration(result.durationMs) }}</span>
          </p>
        </div>
      </div>

      <div class="my-4 tick-rule" />

      <p v-if="result.status === 'PENDING'" class="text-sm">
        台里还没审到，耐心等等。审核通过后这里会显示排在哪天哪个时段。
      </p>
      <p v-else-if="result.schedule" class="text-sm">
        排在
        <span class="font-mono tabular-nums">{{ result.schedule.playDate }}</span>
        的{{ result.schedule.slotName }}，第
        <span class="font-mono tabular-nums">{{ result.schedule.orderNo }}</span>
        首。
        <span v-if="result.status === 'PLAYED'" class="text-ink-soft">已经播过了。</span>
      </p>
      <p v-else-if="result.status === 'REJECTED'" class="text-sm">
        没通过。理由：{{ result.rejectReason || '台里没写理由' }}
      </p>
      <p v-else class="text-sm text-ink-soft">已通过，等排时段。</p>
    </div>
  </section>
</template>
