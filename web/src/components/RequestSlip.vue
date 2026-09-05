<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ApiError, GRADE_OPTIONS, submitRequest } from '@/lib/api'
import type { Grade, Song } from '@/lib/api'
import { duration } from '@/lib/slots'
import { useSite } from '@/stores/site'

const props = defineProps<{ song: Song | null }>()
const emit = defineEmits<{ close: [] }>()

const site = useSite()

const grade = ref<Grade>('G1')
const classNo = ref<number>(1)
const name = ref('')
const submitting = ref(false)
const failure = ref<string | null>(null)
const code = ref<string | null>(null)

const classes = computed(() =>
  Array.from({ length: site.classCounts[grade.value] ?? 23 }, (_, index) => index + 1),
)

// 换歌就重置，别把上一首的结果留在弹窗里
watch(
  () => props.song?.platformId,
  () => {
    code.value = null
    failure.value = null
    submitting.value = false
  },
)

watch(grade, () => {
  const max = site.classCounts[grade.value] ?? 23
  if (classNo.value > max) classNo.value = max
})

async function send(): Promise<void> {
  if (!props.song || submitting.value) return
  submitting.value = true
  failure.value = null
  try {
    const result = await submitRequest({
      source: props.song.source,
      platformId: props.song.platformId,
      ...(site.requireIdentity
        ? { grade: grade.value, classNo: classNo.value, requesterName: name.value.trim() }
        : {}),
    })
    code.value = result.queryCode
  } catch (error) {
    failure.value = error instanceof ApiError ? error.message : '提交失败，再试一次'
  } finally {
    submitting.value = false
  }
}

async function copyCode(): Promise<void> {
  if (!code.value) return
  await navigator.clipboard?.writeText(code.value).catch(() => undefined)
}
</script>

<template>
  <div
    v-if="song"
    class="slip-backdrop fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-4 sm:items-center"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <!-- 这张就是全站唯一放开装饰的地方：一张油印点歌条 -->
    <div class="slip w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby="slip-title">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="eyebrow">点歌条</p>
          <h2 id="slip-title" class="mt-1.5 text-xl overprint">{{ song.title }}</h2>
          <p class="mt-1 text-sm text-ink-soft">
            {{ song.artist }}
            <span class="font-mono tabular-nums"> · {{ duration(song.durationMs) }}</span>
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-badge border border-rule px-2 py-1 text-sm"
          @click="emit('close')"
        >
          关闭
        </button>
      </div>

      <div class="my-4 tick-rule" />

      <template v-if="code">
        <p class="text-sm">点好了。凭这个码查审核结果，记下来：</p>
        <p class="stamp mt-3 font-mono text-3xl tracking-[0.18em] tabular-nums">{{ code }}</p>
        <div class="mt-4 flex gap-2">
          <button type="button" class="rounded-control border border-rule px-3 py-2 text-sm" @click="copyCode">
            复制
          </button>
          <RouterLink
            to="/lookup"
            class="pressable rounded-control border border-rule px-3 py-2 text-sm"
          >
            去查询页
          </RouterLink>
          <button type="button" class="btn-primary ml-auto px-4 py-2 text-sm" @click="emit('close')">
            继续点歌
          </button>
        </div>
      </template>

      <form v-else class="space-y-3" @submit.prevent="send">
        <template v-if="site.requireIdentity">
          <div class="flex gap-2">
            <label class="grow">
              <span class="eyebrow">年级</span>
              <select v-model="grade" class="field mt-1.5">
                <option v-for="item in GRADE_OPTIONS" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>
            <label class="grow">
              <span class="eyebrow">班级</span>
              <select v-model.number="classNo" class="field mt-1.5">
                <option v-for="item in classes" :key="item" :value="item">{{ item }} 班</option>
              </select>
            </label>
          </div>
          <label class="block">
            <span class="eyebrow">姓名</span>
            <input v-model="name" type="text" maxlength="12" class="field mt-1.5" placeholder="写真名，方便台里核对" />
          </label>
        </template>
        <p v-else class="text-sm text-ink-soft">现在是匿名点歌，不用填身份。</p>

        <p v-if="failure" class="text-sm text-orange-deep">{{ failure }}</p>

        <button type="submit" class="btn-primary w-full py-3" :disabled="submitting">
          {{ submitting ? '提交中…' : '确认点这首' }}
        </button>
        <p class="text-xs text-ink-soft">
          提交后会给一个 6 位查询码。审核通过并排好时段才会出现在播出单里。
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* 遮罩：ink 是 var() 颜色，Tailwind 的透明度修饰符对它无效，只能自己 mix */
.slip-backdrop {
  background-color: color-mix(in srgb, var(--c-ink) 45%, transparent);
}

/* 点歌条：轻微倾斜 + 上下齿孔 + 硬边阴影。全站只有这一处放开装饰 */
.slip {
  position: relative;
  background-color: var(--c-paper-hi);
  border: 1px solid var(--c-rule);
  border-radius: var(--radius-card);
  padding: 1.25rem;
  box-shadow: 3px 3px 0 0 color-mix(in srgb, var(--c-ink) 16%, transparent);
  transform: rotate(-0.4deg);
}

.slip::before,
.slip::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 7px;
  background-image: radial-gradient(circle, var(--c-paper) 3.2px, transparent 3.6px);
  background-size: 12px 12px;
  background-position: center;
}

.slip::before {
  top: -3px;
}

.slip::after {
  bottom: -3px;
}

/* 套印偏移：橙色版稍微错开一点，像丝网印刷没对准 */
.overprint {
  text-shadow: 1.5px 1.5px 0 color-mix(in srgb, var(--color-orange) 60%, transparent);
}

/* 查询码盖章 */
.stamp {
  display: inline-block;
  border: 2px solid var(--color-orange);
  border-radius: var(--radius-badge);
  padding: 0.35rem 0.8rem;
  color: var(--color-orange-deep);
  transform: rotate(-2.5deg);
  animation: stamp-in 260ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
}

@keyframes stamp-in {
  from {
    opacity: 0;
    transform: rotate(-2.5deg) scale(1.7);
  }
  to {
    opacity: 1;
    transform: rotate(-2.5deg) scale(1);
  }
}

.field {
  display: block;
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--c-rule);
  border-radius: var(--radius-control);
  background-color: var(--c-paper);
  font: inherit;
  color: inherit;
}
</style>
