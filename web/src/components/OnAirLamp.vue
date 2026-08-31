<script setup lang="ts">
const { on = false } = defineProps<{ on?: boolean }>()
</script>

<template>
  <span class="flex items-center gap-2">
    <span class="lamp" :class="{ 'lamp-on': on }" />
    <span class="eyebrow" :class="on ? 'text-orange-deep' : 'text-ink-faint'">
      {{ on ? 'On Air' : 'Off Air' }}
    </span>
  </span>
</template>

<style scoped>
.lamp {
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  background-color: var(--c-ink-faint);
}

.lamp-on {
  background-color: var(--color-orange);
  animation: breathe 2.4s ease-in-out infinite;
}

@keyframes breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-orange) 50%, transparent);
  }
  50% {
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--color-orange) 0%, transparent);
  }
}
</style>
