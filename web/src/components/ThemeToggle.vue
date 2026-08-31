<script setup lang="ts">
import { ref } from 'vue'
import { readTheme, setTheme, type Theme } from '@/lib/theme'

const ORDER: Theme[] = ['system', 'light', 'dark']
const LABEL: Record<Theme, string> = { system: '自动', light: '浅色', dark: '深色' }

const current = ref<Theme>(readTheme())

function cycle(): void {
  const next = ORDER[(ORDER.indexOf(current.value) + 1) % ORDER.length] as Theme
  current.value = next
  setTheme(next)
}
</script>

<template>
  <button
    type="button"
    class="eyebrow rounded-badge border border-rule px-2.5 py-1.5 hover:border-ink-soft"
    :aria-label="`外观：${LABEL[current]}，点击切换`"
    @click="cycle"
  >
    {{ LABEL[current] }}
  </button>
</template>
